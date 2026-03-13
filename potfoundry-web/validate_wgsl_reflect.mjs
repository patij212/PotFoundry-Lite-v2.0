/**
 * Validates composed WGSL shader using wgsl_reflect parser.
 * This catches WGSL syntax errors without needing a browser.
 */
import fs from 'fs';

async function main() {
    // Dynamic import of ESM module
    const { WgslReflect } = await import('wgsl_reflect');
    
    const shaderSource = fs.readFileSync('composed_mobile_shader.wgsl', 'utf8');
    console.log(`Shader: ${shaderSource.length} bytes, ${shaderSource.split('\n').length} lines`);

    try {
        const reflect = new WgslReflect(shaderSource);
        console.log('\n✅ WGSL parsed successfully!');
        console.log(`  Functions: ${reflect.functions.map(f => f.name).join(', ')}`);
        console.log(`  Entry points: ${reflect.entry.vertex.map(e => e.name).join(', ')} (vertex), ${reflect.entry.fragment.map(e => e.name).join(', ')} (fragment)`);
        console.log(`  Structs: ${reflect.structs.map(s => s.name).join(', ')}`);
        console.log(`  Uniforms: ${reflect.uniforms.map(u => u.name).join(', ')}`);
    } catch (e) {
        console.error('\n❌ WGSL parse error:', e.message);
        // Try to find the error location
        if (e.message) {
            const match = e.message.match(/line\s*(\d+)/i);
            if (match) {
                const lineNum = parseInt(match[1]);
                const lines = shaderSource.split('\n');
                console.log(`\n  Context around line ${lineNum}:`);
                for (let i = Math.max(0, lineNum - 3); i < Math.min(lines.length, lineNum + 3); i++) {
                    const marker = i + 1 === lineNum ? '>>>' : '   ';
                    console.log(`  ${marker} ${i + 1}: ${lines[i]}`);
                }
            }
        }
    }
}

main().catch(e => {
    console.error('Script error:', e);
    process.exit(1);
});
