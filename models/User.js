const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const UserSchema = new Schema({
    username: { type: String, required: true, unique: true, minlength: 4 },
    password: { type: String, required: true },
    phoneNumber: { type: String, required: false },
    email: { type: String, required: true, match: /^[\w-\\.]+@([\w-]+\.)+[\w-]{2,4}$/g },
    name: { type: String, required: true },
    age: { type: Number, required: false },
    bio: { type: String, required: false },
    cover: { type: String, required: false }, 
});

const UserModel = model('User', UserSchema);

module.exports = UserModel;