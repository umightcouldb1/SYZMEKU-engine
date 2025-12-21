import React, { useEffect, useRef } from 'react';

const AuthScreen = () => {
  const canvasRef = useRef(null);
  const buttonText = 'INITIATE ASCENSION';
  const titleText = 'SYZMEKU ENGINE';

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

    const characters =
      'ᚙᚚ᚛᚜☖☗☰☱☲☳☴☵☶☷☸♔♕♖♗♘♙♚♛♜♝♞♟✚✙✛✜✟✠✡✢✣✤✥';
    const charArray = characters.split('');
    const fontSize = 16;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = Array.from({ length: columns }, () => 1);

    const draw = () => {
      ctx.fillStyle = 'rgba(5, 5, 15, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#FFD700';
      ctx.font = `${fontSize}px "Space Mono", monospace`;

      for (let i = 0; i < drops.length; i += 1) {
        const text = charArray[Math.floor(Math.random() * charArray.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.99) {
          drops[i] = 0;
        }
        drops[i] += 1;
      }
    };

    const interval = setInterval(draw, 65);
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
        <h1 className="glitch-text">{titleText}</h1>
        <input type="email" placeholder="IDENTIFIER" />
        <input type="password" placeholder="SECURITY KEY" />
        <button className="sovereign-button" type="button">
          {buttonText}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
