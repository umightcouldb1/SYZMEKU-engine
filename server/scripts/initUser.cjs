const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const User = mongoose.model('User', UserSchema);

const initialize = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('CONNECTED TO MEMORY GRID');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Syzmeku@2025', salt);

    await User.findOneAndUpdate(
      { email: 'latoya.t.duke@gmail.com' },
      { password: hashedPassword },
      { upsert: true, new: true }
    );

    console.log('SUCCESS: USER ACCESS PROTOCOL SYNCED');
    process.exit();
  } catch (err) {
    console.error('SYNC ERROR:', err);
    process.exit(1);
  }
};

initialize();
