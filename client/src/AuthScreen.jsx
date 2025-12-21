import React, { useEffect, useRef } from 'react';

const AuthScreen = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();

    const characters = 'ΔΘΛΞΠΣΦΨΩαβγδεζηθικλμνξοπρστυφχψω0123456789';
    const charArray = characters.split('');
    const fontSize = 16;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = Array.from({ length: columns }, () => 1);

    const draw = () => {
      ctx.fillStyle = 'rgba(5, 5, 15, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffd700';
      ctx.font = `${fontSize}px serif`;

      for (let i = 0; i < drops.length; i += 1) {
        const text = charArray[Math.floor(Math.random() * charArray.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 1;
      }
    };

    const interval = setInterval(draw, 33);
    window.addEventListener('resize', resizeCanvas);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <div className="access-portal">
      <canvas id="atlantean-bg" ref={canvasRef} />
      <div className="login-card">
        <h1>ACCESS PROTOCOL</h1>
        <input type="email" placeholder="IDENTIFIER" />
        <input type="password" placeholder="SECURITY KEY" />
        <button type="button">INITIATE ASCENSION</button>
      </div>
    </div>
  );
};

export default AuthScreen;
