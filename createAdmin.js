const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcrypt');

const MONGO_URI = 'mongodb://localhost:27017/seabattle';

async function createAdmin() {
  await mongoose.connect(MONGO_URI);
  const login = 'admin'; // Логин для админа
  const nickname = 'Админ'; // Никнейм
  const password = 'admin123'; // Пароль
  const existing = await User.findOne({ login });
  if (existing) {
    console.log('Пользователь с этим логином уже существует.');
    process.exit(0);
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const adminUser = new User({
    nickname,
    login,
    password: hashedPassword,
    status: 'admin',
  });
  await adminUser.save();
  console.log('Админ аккаунт создан.');
  process.exit(0);
}

createAdmin();