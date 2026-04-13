const map = L.map('map').setView([14.5764, 121.0851], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const markersLayer = L.layerGroup().addTo(map);

async function loadBusinesses() {
  try {
    const res = await fetch('/api/businesses');
    const data = await res.json();

    console.log("API DATA:", data);

    if (!Array.isArray(data)) {
      console.error("Invalid API response");
      return;
    }

    data.forEach(b => {

      const lat = Number(b.lat);
      const lon = Number(b.lon);

      if (Number.isFinite(lat) && Number.isFinite(lon)) {

        const marker = L.marker([lat, lon], { icon: redIcon });

        marker.bindPopup(`
          <b>${b.business_name || ''}</b><br>
          ${b.address || ''}
        `);

        markersLayer.addLayer(marker);
      }

    });

    console.log("Markers loaded:", markersLayer.getLayers().length);

  } catch (error) {
    console.error("Failed to load businesses:", error);
  }
}

loadBusinesses();

map.on('click', function(e) {
  const lat = e.latlng.lat.toFixed(6);
  const lng = e.latlng.lng.toFixed(6);

  const svDiv = document.getElementById('street-view');

  svDiv.innerHTML = `
    <iframe
      src="https://www.mapillary.com/embed?map_style=Mapillary%20light&lat=${lat}&lng=${lng}&z=17"
      style="width:100%;height:100%;border:none;">
    </iframe>
  `;

  svDiv.style.display = 'block';
  document.getElementById('closeSV').style.display = 'block';
});

document.getElementById('closeSV').onclick = () => {
  const svDiv = document.getElementById('street-view');
  svDiv.style.display = 'none';
  svDiv.innerHTML = '';
  document.getElementById('closeSV').style.display = 'none';
};

const input = document.getElementById('search-input');

input.addEventListener('keydown', async function(e) {
  if (e.key !== 'Enter') return;

  const query = input.value.trim();
  if (!query) return;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
    );

    const data = await res.json();

    if (!data.length) {
      alert('Location not found.');
      return;
    }

    const { lat, lon, display_name } = data[0];
    const latlng = [Number(lat), Number(lon)];

    map.setView(latlng, 16);

    L.marker(latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup(display_name)
      .openPopup();

  } catch (error) {
    console.error("Search error:", error);
  }
});

document.getElementById('saved-btn').onclick = () => {};
document.getElementById('profile-btn').onclick = () => {};