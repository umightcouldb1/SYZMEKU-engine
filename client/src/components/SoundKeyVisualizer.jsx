import React, { useRef, useEffect } from 'react';
import { drawSoundGlyphs } from '../core/toneTracker';

export default function SoundKeyVisualizer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx || !navigator.mediaDevices?.getUserMedia) {
      return undefined;
    }

    let audioCtx;
    let analyser;
    let source;
    let animationFrame;
    let stream;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((mediaStream) => {
      stream = mediaStream;
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      analyser.fftSize = 2048;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        analyser.getByteFrequencyData(dataArray);
        drawSoundGlyphs(ctx, dataArray, canvas.width, canvas.height);
        animationFrame = requestAnimationFrame(draw);
      };
      draw();
    });

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (audioCtx) {
        audioCtx.close();
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={300}
      style={{ background: 'black', width: '100%', borderRadius: '16px' }}
    />
  );
}
