const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

// Check head.ejs
const headPath = path.join(__dirname, 'src/views/partials/head.ejs');
const headTemplate = fs.readFileSync(headPath, 'utf8');

try {
  // Try to compile the template
  ejs.compile(headTemplate, {strict: true});
  console.log('EJS syntax is valid for head.ejs');
} catch (error) {
  console.error('EJS syntax error in head.ejs:', error.message);
}

// Check login.ejs
const loginPath = path.join(__dirname, 'src/views/login.ejs');
const loginTemplate = fs.readFileSync(loginPath, 'utf8');

try {
  ejs.compile(loginTemplate, {strict: true});
  console.log('EJS syntax is valid for login.ejs');
} catch (error) {
  console.error('EJS syntax error in login.ejs:', error.message);
}