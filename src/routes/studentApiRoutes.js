const express = require('express');
const router = express.Router();
const { getStudentsApi } = require('../controllers/studentApiController');

router.get('/', getStudentsApi);

module.exports = router;