const fs = require('fs');
const path = require('path');

console.log('=== Checking head.ejs EJS syntax ===');

// Read the template content
templatePath = path.join(__dirname, 'src/views/partials/head.ejs');
const template = fs.readFileSync(templatePath, 'utf8');

console.log('Template length:', template.length, 'characters');
console.log('Last 500 characters:');
console.log(template.slice(-500));

// Check for specific EJS patterns
console.log('\n=== Checking for EJS try-catch syntax ===');

// Find the problematic area - looking for incomplete control structures
const lines = template.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<% if')) {
    console.log(`Line ${i+1}: ${lines[i].trim()}`);
    if (i + 1 < lines.length) {
      console.log(`Line ${i+2}: ${lines[i+1].trim()}`);
    }
  }
}

// Look for incomplete EJS blocks
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('<% if') || line.includes('<% }')) {
    console.log(`\nLine ${i+1}: ${line.trim()}`);
  }
}