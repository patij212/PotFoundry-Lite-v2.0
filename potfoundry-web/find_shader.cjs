const fs = require('fs');
const filePath = 'src/webgpu_core.ts';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
console.log('--- CHECK ---');
lines.forEach((line, i) => {
    if (line.includes('stripFunctions')) {
        console.log(`${i + 1}: ${line}`);
    }
});
