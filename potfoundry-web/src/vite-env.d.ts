/// <reference types="vite/client" />

// Type declarations for Vite's raw imports
declare module '*.wgsl?raw' {
    const content: string;
    export default content;
}

declare module '*.glsl?raw' {
    const content: string;
    export default content;
}
