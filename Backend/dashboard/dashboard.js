const map = L.map('map').setView([14.5764, 121.0851], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

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

    L.marker(latlng)
      .addTo(map)
      .bindPopup(display_name)
      .openPopup();

  } catch (error) {
    console.error("Search error:", error);
  }
});

document.getElementById('saved-btn').onclick = () => {};
document.getElementById('profile-btn').onclick = () => {};