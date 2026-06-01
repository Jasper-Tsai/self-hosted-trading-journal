'use client';

import { useEffect, useRef } from 'react';

export function AmbientBackground() {
    const spotlightRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (spotlightRef.current) {
                spotlightRef.current.style.left = `${e.clientX}px`;
                spotlightRef.current.style.top = `${e.clientY}px`;
            }
        };

        const handleMouseEnter = () => {
            spotlightRef.current?.classList.add('active');
        };

        const handleMouseLeave = () => {
            spotlightRef.current?.classList.remove('active');
        };

        window.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseenter', handleMouseEnter);
        document.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseenter', handleMouseEnter);
            document.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    return (
        <>
            {/* Layer 1 — Base gradient canvas + noise + grid */}
            <div className="ambient-canvas" aria-hidden="true" />

            {/* Layer 4 — Animated gradient blobs */}
            <div className="ambient-blob ambient-blob-primary" aria-hidden="true" />
            <div className="ambient-blob ambient-blob-secondary" aria-hidden="true" />
            <div className="ambient-blob ambient-blob-tertiary" aria-hidden="true" />
            <div className="ambient-blob ambient-blob-bottom" aria-hidden="true" />

            {/* Mouse-tracking spotlight */}
            <div
                ref={spotlightRef}
                className="mouse-spotlight"
                aria-hidden="true"
            />
        </>
    );
}
