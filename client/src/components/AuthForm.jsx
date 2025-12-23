// --- FILE: client/src/components/AuthForm.jsx ---
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login, register, reset } from '../features/auth/authSlice'; // We will create this slice next
import Spinner from './Spinner'; // We will create this component later

function AuthForm() {
    // --- 1. STATE MANAGEMENT ---
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        password2: '', // For registration confirmation
    });
    const [isLogin, setIsLogin] = useState(true);

    const { name, email, password, password2 } = formData;

    const navigate = useNavigate();
    const dispatch = useDispatch();

    const { user, isLoading, isError, isSuccess, message } = useSelector(
        (state) => state.auth || {}
    );

    // --- 2. SIDE EFFECTS ---
    useEffect(() => {
        if (isError) {
            alert(`Error: ${message}`);
        }

        // Redirect when logged in/registered
        if (isSuccess || user) {
            navigate('/dashboard'); // Navigate to the main dashboard after success
        }

        // Clean up state on unmount or after success/error
        dispatch(reset());
    }, [user, isError, isSuccess, message, navigate, dispatch]);

    // --- 3. HANDLERS ---
    const onChange = (e) => {
        setFormData((prevState) => ({
            ...prevState,
            [e.target.name]: e.target.value,
        }));
    };

    const onSubmit = (e) => {
        e.preventDefault();

        if (isLogin) {
            // Login Logic
            const userData = { email, password };
            dispatch(login(userData));
        } else {
            // Register Logic
            if (password !== password2) {
                alert('Passwords do not match');
            } else {
                const userData = { name, email, password };
                dispatch(register(userData));
            }
        }
    };

    // --- 4. RENDER ---
    if (isLoading) {
        return <Spinner />; // Displays a loading spinner if needed
    }

    return (
        <section className='form-container'>
            <h2>{isLogin ? 'Log In' : 'Register Account'}</h2>
            <p>Please enter your credentials to {isLogin ? 'log in' : 'register'}</p>

            <form onSubmit={onSubmit}>
                {!isLogin && (
                    <div className='form-group'>
                        <input
                            type='text'
                            id='name'
                            name='name'
                            value={name}
                            placeholder='Enter your name'
                            onChange={onChange}
                            required
                        />
                    </div>
                )}

                <div className='form-group'>
                    <input
                        type='email'
                        id='email'
                        name='email'
                        value={email}
                        placeholder='Enter your email'
                        onChange={onChange}
                        required
                    />
                </div>
                <div className='form-group'>
                    <input
                        type='password'
                        id='password'
                        name='password'
                        value={password}
                        placeholder='Enter password'
                        onChange={onChange}
                        required
                    />
                </div>

                {!isLogin && (
                    <div className='form-group'>
                        <input
                            type='password'
                            id='password2'
                            name='password2'
                            value={password2}
                            placeholder='Confirm password'
                            onChange={onChange}
                            required
                        />
                    </div>
                )}

                <div className='form-group'>
                    <button type='submit' className='btn btn-block'>
                        {isLogin ? 'Login' : 'Register'}
                    </button>
                </div>
            </form>

            <p className='toggle-link'>
                {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                <span onClick={() => setIsLogin(!isLogin)} className='link-style'>
                    {isLogin ? 'Register' : 'Login'}
                </span>
            </p>
        </section>
    );
}

export default AuthForm;
