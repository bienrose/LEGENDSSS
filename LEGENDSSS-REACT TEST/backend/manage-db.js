const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database(path.join(__dirname, 'spotmap.db'));

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAll(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  const command = process.argv[2];
  
  try {
    switch(command) {
      case 'add-column':
        await runSQL('ALTER TABLE saved_locations ADD COLUMN category TEXT');
        console.log('✅ Added category column');
        break;
        
      case 'add-rating':
        await runSQL('ALTER TABLE saved_locations ADD COLUMN rating INTEGER');
        console.log('✅ Added rating column');
        break;
        
      case 'add-visited':
        await runSQL('ALTER TABLE saved_locations ADD COLUMN visited BOOLEAN DEFAULT 0');
        console.log('✅ Added visited column');
        break;
        
      case 'create-categories':
        await runSQL(`CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          icon TEXT,
          color TEXT
        )`);
        console.log('✅ Created categories table');
        break;
        
      case 'insert-categories':
        await runSQL(`INSERT OR IGNORE INTO categories (name, icon, color) VALUES 
          ('Restaurant', '🍔', '#FF6B6B'),
          ('Park', '🌳', '#4ECDC4'),
          ('Museum', '🏛️', '#45B7D1'),
          ('Cafe', '☕', '#96CEB4'),
          ('Landmark', '🗽', '#FFEAA7')`);
        console.log('✅ Inserted categories');
        break;
        
      case 'show-users':
        const users = await getAll('SELECT id, username, email, created_at FROM users');
        console.table(users);
        break;
        
      case 'show-locations':
        const locations = await getAll('SELECT id, user_id, name, latitude, longitude, notes FROM saved_locations');
        console.table(locations);
        break;
        
      case 'show-categories':
        const categories = await getAll('SELECT * FROM categories');
        console.table(categories);
        break;
        
      case 'delete-all-locations':
        await runSQL('DELETE FROM saved_locations');
        console.log('✅ All locations deleted');
        break;
        
      case 'delete-user':
        const userId = process.argv[3];
        await runSQL('DELETE FROM saved_locations WHERE user_id = ?', [userId]);
        await runSQL('DELETE FROM users WHERE id = ?', [userId]);
        console.log(`✅ User ${userId} deleted`);
        break;
        
      case 'add-sample':
        const sampleUser = await new Promise((resolve) => {
          db.get('SELECT id FROM users LIMIT 1', [], (err, row) => {
            resolve(row);
          });
        });
        
        if (sampleUser) {
          await runSQL(`INSERT INTO saved_locations (user_id, name, latitude, longitude, notes) VALUES 
            (${sampleUser.id}, 'Central Park', 40.785091, -73.968285, 'Beautiful NYC park'),
            (${sampleUser.id}, 'Eiffel Tower', 48.8584, 2.2945, 'Paris landmark'),
            (${sampleUser.id}, 'Tokyo Tower', 35.6586, 139.7454, 'Tokyo landmark')`);
          console.log('✅ Added sample locations');
        } else {
          console.log('No user found. Create a user first');
        }
        break;
        
      default:
        console.log(`
Commands:
  node manage-db.js add-column        - Add category column
  node manage-db.js add-rating        - Add rating column  
  node manage-db.js add-visited       - Add visited column
  node manage-db.js create-categories - Create categories table
  node manage-db.js insert-categories - Insert default categories
  node manage-db.js show-users        - Show all users
  node manage-db.js show-locations    - Show all locations
  node manage-db.js show-categories   - Show categories
  node manage-db.js delete-all-locations - Clear all locations
  node manage-db.js delete-user <id>  - Delete user by ID
  node manage-db.js add-sample        - Add sample locations
        `);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    db.close();
  }
}

main();