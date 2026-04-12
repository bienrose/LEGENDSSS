const express = require('express');
const router = express.Router();
const db = require('../database');
const authenticateToken = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  db.all('SELECT * FROM saved_locations WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
});

router.post('/', authenticateToken, (req, res) => {
  const { name, latitude, longitude, notes } = req.body;
  db.run('INSERT INTO saved_locations (user_id, name, latitude, longitude, notes) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, name, latitude, longitude, notes || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, user_id: req.user.id, name, latitude, longitude, notes });
    });
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM saved_locations WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Deleted successfully' });
    });
});

module.exports = router;