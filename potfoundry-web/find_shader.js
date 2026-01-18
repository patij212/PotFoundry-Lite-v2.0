const fs = require('fs');
const content = fs.readFileSync('c:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/src/webgpu_core.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('createShaderModule')) {
        console.log(`Found at line ${i + 1}: ${line.trim()}`);
    }
});
