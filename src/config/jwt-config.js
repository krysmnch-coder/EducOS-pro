const jwt = require('jsonwebtoken');
const secret = 'educos-pro-jwt-secret';
const expiresIn = '3h';

function signToken(payload) {
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, secret);
}

module.exports = {
  signToken,
  verifyToken
};
