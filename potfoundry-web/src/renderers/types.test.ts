/**
 * Renderer Types Tests
 * Tests for shared renderer types and interfaces.
 */
import { describe, it, expect } from 'vitest';
import type { ExportOptions, CreateRendererResult, CreateRendererOptions } from './types';

describe('ExportOptions Interface', () => {
    it('should allow valid quality settings', () => {
        const options: ExportOptions = {
            quality: 'high',
            filename: 'pot.stl'
        };
        expect(options.quality).toBe('high');
        expect(options.filename).toBe('pot.stl');
    });

    it('should support optional fields', () => {
        const options: ExportOptions = {};
        expect(options.quality).toBeUndefined();
    });
});

describe('CreateRendererResult Interface', () => {
    it('should structure result correctly', () => {
        const result: CreateRendererResult = {
            controller: null,
            usedFallback: false,
            error: new Error('test')
        };
        expect(result.controller).toBeNull();
        expect(result.usedFallback).toBe(false);
        expect(result.error).toBeDefined();
    });
});

describe('CreateRendererOptions Interface', () => {
    it('should extend MountOptions', () => {
        const options: CreateRendererOptions = {
            canvas: document.createElement('canvas'),
            forceRenderer: 'webgpu',
            onFallback: () => { }
        };
        expect(options.canvas).toBeDefined();
        expect(options.forceRenderer).toBe('webgpu');
    });
});
