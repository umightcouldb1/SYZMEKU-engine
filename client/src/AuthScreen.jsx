import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login, reset } from './features/auth/authSlice';

const AuthScreen = () => {
  const canvasRef = useRef(null);
  const titleText = 'SYZMEKU // RECLAIM YOUR ESSENCE';
  const [displayText, setDisplayText] = useState('BEGIN ASCENSION');
  const [ascensionActive, setAscensionActive] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isError, isLoading, message } = useSelector((state) => state.auth || {});

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

    const characters = 'ᚙᚚ᚛᚜☖☗☰☱☲☳☴☵☶☷☸♔♕♖♗♘♙♚♛♜♝♞♟✚✙✛✜';
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

    const interval = setInterval(draw, 75);
    window.addEventListener('resize', resizeCanvas);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useEffect(() => {
    if (isError) {
      setDisplayText('SIGN REJECTED');
      const timeout = setTimeout(() => setDisplayText('BEGIN ASCENSION'), 2000);
      dispatch(reset());
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [dispatch, isError]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setDisplayText('SYNCHRONIZING...');

    try {
      const resultAction = await dispatch(login({ email, password, frequency: 445 }));
      if (!login.fulfilled.match(resultAction)) {
        setDisplayText('SIGN REJECTED');
        setTimeout(() => setDisplayText('BEGIN ASCENSION'), 2000);
        return;
      }

      setDisplayText('ASCENSION COMPLETE');
      setAscensionActive(true);
      const token = resultAction.payload?.token;
      if (token) {
        localStorage.setItem('syz_token', token);
      }
      setTimeout(() => navigate('/dashboard'), 900);
    } catch (error) {
      setDisplayText('ENGINE ERROR');
    }
  };

  return (
    <div className="access-portal login-container">
      <canvas id="atlantean-bg" ref={canvasRef} />
      {ascensionActive ? <div className="ascension-bloom" /> : null}
      <div className="login-card">
        <h1 className="glitch-text">{titleText}</h1>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="WHO ARE YOU?"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="YOUR SECRET SIGN"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button className="sovereign-button" type="submit" disabled={isLoading}>
            {displayText}
          </button>
        </form>
        {isError && message ? <p className="auth-error">{message}</p> : null}
      </div>
    </div>
  );
};

export default AuthScreen;
