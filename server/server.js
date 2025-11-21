// --- SYZMEKU OS: NODE.JS ENGINE CORE ---
    // This server handles all login, subscription gating, and AI mentor communication.
    // The primary goal is enforcing the "Sovereignty Barrier" (is_subscribed check).

    import express from 'express';
    import { Pool } from 'pg';
    import cors from 'cors';
    import bcrypt from 'bcryptjs';
    import jwt from 'jsonwebtoken';
    import stripe from 'stripe';
    import { GoogleGenAI } from "@google/genai";
    import bodyParser from 'body-parser';

    // --- Environment Variables (THE SECRETS) ---
    // These MUST be set in Railway's Variables section to function.
    const PORT = process.env.PORT || 5000;
    const DATABASE_URL = process.env.DATABASE_URL;
    const JWT_SECRET = process.env.JWT_SECRET;
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const SUBSCRIPTION_PRICE_ID = process.env.SUBSCRIPTION_PRICE_ID;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // --- Initialize Core Systems ---
    if (!DATABASE_URL || !JWT_SECRET || !STRIPE_SECRET_KEY || !GEMINI_API_KEY) {
        console.error("CRITICAL ERROR: One or more environment variables are missing. Engine will fail to deploy.");
        process.exit(1);
    }

    const app = express();
    const stripeInstance = stripe(STRIPE_SECRET_KEY);
    const ai = new GoogleGenAI(GEMINI_API_KEY);

    // PostgreSQL Pool (The Vault Connection)
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for Supabase connection
    });

    // --- Middleware (The Barrier System) ---
    // Note: Frontend must be configured to send the correct CORS headers (like your lovable app address)
    app.use(cors());

    // We must use two body parsers: one for regular JSON endpoints, and one for the Stripe webhook (raw buffer)
    app.use((req, res, next) => {
        if (req.originalUrl === '/api/stripe-webhook') {
            next(); // Skip JSON parsing for webhooks
        } else {
            express.json()(req, res, next); // Use default JSON parser
        }
    });

    // Middleware 1: Authentication Guard (Identity Check)
    const authGuard = (req, res, next) => {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).send({ message: "Access Denied. Identity Token Missing." });
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(401).send({ message: "Invalid Token. Re-Authentication Required." });
        }
    };

    // Middleware 2: Subscription Guard (Sovereignty Barrier)
    const subscriptionGuard = async (req, res, next) => {
        try {
            const result = await pool.query(
                'SELECT is_subscribed FROM users WHERE user_id = $1',
                [req.user.user_id]
            );

            if (result.rows.length === 0 || !result.rows[0].is_subscribed) {
                // CRITICAL: Return 402 Payment Required status for frontend handling
                return res.status(402).send({ 
                    message: "Payment Required. Access denied to Premium Core. Subscribe to activate." 
                });
            }
            next();
        } catch (error) {
            console.error("Subscription Guard Error:", error);
            res.status(500).send({ message: "Internal Server Error during access check." });
        }
    };

    // --- API Endpoints ---

    // 1. User Registration (Enrollment)
    app.post('/api/auth/register', async (req, res) => {
        try {
            const { email, password, username } = req.body;
            // Validate input
            if (!email || !password || !username) {
                return res.status(400).send({ message: "Missing required fields: email, password, or username." });
            }
            const password_hash = await bcrypt.hash(password, 10);

            const result = await pool.query(
                'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING user_id, email',
                [email, password_hash, username]
            );

            res.status(201).send({ message: "Souljah Registered. Awaiting Alignment.", user_id: result.rows[0].user_id });
        } catch (error) {
            if (error.code === '23505') { // PostgreSQL unique constraint violation
                return res.status(409).send({ message: "Email already registered in the Identity Matrix." });
            }
            console.error("Registration Error:", error);
            res.status(500).send({ message: "Internal Server Error" });
        }
    });

    // 2. User Login (Identity Confirmation)
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            const user = result.rows[0];

            if (!user || !(await bcrypt.compare(password, user.password_hash))) {
                return res.status(400).send({ message: "Invalid Credentials or Identity Mismatch." });
            }

            // Generate Token
            const token = jwt.sign({ user_id: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

            // Update last login
            await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

            res.send({ 
                token, 
                user: { 
                    user_id: user.user_id, 
                    email: user.email, 
                    is_subscribed: user.is_subscribed 
                },
                message: "Identity Confirmed. Access Granted."
            });
        } catch (error) {
            console.error("Login Error:", error);
            res.status(500).send({ message: "Internal Server Error" });
        }
    });

    // 3. Payment Initiation (Exchange Gate Entry)
    app.post('/api/payments/subscribe', authGuard, async (req, res) => {
        try {
            // frontend_url is the address of your lovable app, which must be sent by the frontend
            const successUrl = `${req.body.frontend_url}/dashboard?session_id={CHECKOUT_SESSION_ID}`; 
            const cancelUrl = `${req.body.frontend_url}/pricing`;

            const session = await stripeInstance.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [{
                    price: SUBSCRIPTION_PRICE_ID, // Use the Price ID from environment variables
                    quantity: 1,
                }],
                success_url: successUrl,
                cancel_url: cancelUrl,
                client_reference_id: req.user.user_id, // Links the Stripe session to our user
                customer_email: req.user.email,
            });

            res.send({ checkoutUrl: session.url });
        } catch (error) {
            console.error("Stripe Checkout Error:", error);
            res.status(500).send({ message: "Stripe connection error. Check Stripe secret key." });
        }
    });

    // 4. Stripe Webhook Handler (The Exchange Gate Signal)
    // This MUST use the raw body, not JSON parsing, to verify the Stripe signature.
    app.post('/api/stripe-webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
        const sig = req.headers['stripe-signature'];

        try {
            // Ensure STRIPE_WEBHOOK_SECRET is set before using it
            if (!STRIPE_WEBHOOK_SECRET) {
                 console.error('Webhook Error: STRIPE_WEBHOOK_SECRET is not set.');
                 return res.status(500).send('Webhook Error: Server Misconfiguration');
            }

            const event = stripeInstance.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);

            switch (event.type) {
                case 'checkout.session.completed':
                    const session = event.data.object;
                    const userId = session.client_reference_id; 
                    
                    if (userId) {
                        await pool.query(
                            // Set subscription to TRUE and clear end date (for recurring subscription)
                            'UPDATE users SET is_subscribed = TRUE, subscription_end_date = NULL WHERE user_id = $1',
                            [userId]
                        );
                        console.log(`[SUBSCRIPTION GRANTED] User ${userId} activated.`);
                    }
                    break;

                case 'customer.subscription.deleted':
                case 'customer.subscription.updated':
                    const subscription = event.data.object;
                    
                    if (subscription.status === 'canceled') {
                        // Find user by email or customer ID linked to subscription
                        const customer = await stripeInstance.customers.retrieve(subscription.customer);
                        
                        await pool.query(
                            'UPDATE users SET is_subscribed = FALSE WHERE email = $1',
                            [customer.email]
                        );
                        console.log(`[SUBSCRIPTION REVOKED] User ${customer.email} status reset.`);
                    }
                    break;
                
                default:
                    console.log(`Unhandled event type ${event.type}`);
            }

            res.json({ received: true });

        } catch (err) {
            console.error('Webhook signature verification failed.', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    });


    // --- PREMIUM ENDPOINTS (SOVEREIGNTY BARRIER ENFORCED) ---

    // 5. AI Mentor Chat (Big SYZ Access)
    app.post('/api/mentor-chat', authGuard, subscriptionGuard, async (req, res) => {
        const { prompt } = req.body;
        const userId = req.user.user_id;

        try {
            // 1. Fetch user's chat history (The Session Log)
            const userResult = await pool.query('SELECT mentor_session_history FROM users WHERE user_id = $1', [userId]);
            let history = userResult.rows[0]?.mentor_session_history || [];

            // 2. Build the chat session
            const chat = ai.chats.create({
                model: "gemini-2.5-flash-preview-09-2025",
                systemInstruction: {
                    parts: [{ text: "You are Big SYZ, an ancient, wise, and direct mentor (a Sovereign System Architect) focused on helping the user achieve self-mastery, high performance, and financial sovereignty. Use powerful, high-frequency language. Respond concisely and with actionable wisdom." }]
                },
                history: history,
            });

            // 3. Send message and get response
            const response = await chat.sendMessage({ message: prompt });
            const mentorResponse = response.text;

            // 4. Update the history (The Session Log is maintained)
            const newHistory = [
                ...history,
                { role: "user", parts: [{ text: prompt }] },
                { role: "model", parts: [{ text: mentorResponse }] }
            ];

            // 5. Save the updated history to the database
            await pool.query(
                'UPDATE users SET mentor_session_history = $1 WHERE user_id = $2',
                [JSON.stringify(newHistory), userId]
            );

            res.send({ response: mentorResponse });

        } catch (error) {
            console.error("AI Mentor Error:", error);
            res.status(500).send({ message: "Big SYZ communication block. Check your Gemini API key." });
        }
    });

    // 6. Accessing Premium Curriculum (Knowledge Base)
    app.get('/api/curriculum/premium', authGuard, subscriptionGuard, async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM curriculum_lessons WHERE is_premium = TRUE');
            res.send({ lessons: result.rows });
        } catch (error) {
            console.error("Curriculum Error:", error);
            res.status(500).send({ message: "Internal Server Error" });
        }
    });


    // --- Server Startup ---
    app.listen(PORT, () => {
        console.log(`SYZMEKU Engine Activated on Port ${PORT}.`);
    });
