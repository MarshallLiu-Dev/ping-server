require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require('./models/Post');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const fs = require('fs');
const path = require('path');
const secret = 'asdfe45we45w345wegw345werjktjwertkj';

app.use(
    cors({
        origin: ['https://jovial-maamoul-38ed7a.netlify.app', 'https://pingsocial.vercel.app'],
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        credentials: true,
    })
);

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Conexão com o MongoDB

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {
        console.log("Conectado ao MongoDB");
    })
    .catch(err => {
        console.error("erro de conexão ao MongoDB:", err);
    });

// Rota para registro de usuário

app.post('/register', uploadMiddleware.single('file'), async (req, res) => {
    const { username, password, name, email, phone, age, bio } = req.body;

    try {
        const saltRounds = 10;
        const hashedPassword = bcrypt.hashSync(password, saltRounds);

        const profileImage = req.file ? req.file.buffer : undefined;

        const userDoc = await User.create({
            username,
            password: hashedPassword,
            name,
            email,
            phone,
            age,
            bio,
            profileImage,
        });

        res.status(200).json(userDoc);
        // console.log(userDoc);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Erro no cadastro' });
    }
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
        return res.status(400).json('User not found');
    }
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
        jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Falha ao gerar token' });
            }
            // console.log('Generated Token:', token); // Adicionando log para o token gerado
            res.cookie('token', token).json({
                id: userDoc._id,
                username,
            });
        });
    } else {
        res.status(400).json('Credenciais erradas');
    }
});

app.get('/profile', (req, res) => {
    const { token } = req.cookies;
    console.log('Token from Cookie:', token); // Adicionando log para o token dos cookies
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) {
            console.error(err);
            return res.status(401).json({ error: 'Token invalido' });
        }
        res.json(info);
    });
});

app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok');
});

app.post('/post', upload.single('file'), async (req, res) => {
    let coverPath = null;

    if (req.file) {
        const { originalname, buffer } = req.file;
        const parts = originalname.split('.');
        const ext = parts[parts.length - 1];

        const filename = `${Date.now()}.${ext}`;
        const filePath = path.join(__dirname, 'uploads', filename);

        fs.writeFileSync(filePath, buffer);
        coverPath = `uploads/${filename}`;
        console.log('File path:', filePath);
    }

    const { token } = req.cookies;
    // console.log('Token:', token);

    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) {
            console.error(err);
            return res.status(401).json({ error: 'Token invalido' });
        }

        const { title, summary, content } = req.body;

        try {
            const postDoc = await Post.create({
                title,
                summary,
                content,
                cover: coverPath,
                author: info.id,
                name: info.name,
            });

            res.status(201).json(postDoc);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Falha ao gerar o Post' });
        }
    });
});

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
    let newPath = null;
    if (req.file) {
        const { originalname, path } = req.file;
        const parts = originalname.split('.');
        const ext = parts[parts.length - 1];
        newPath = path + '.' + ext;
        fs.renameSync(path, newPath);
    }

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) throw err;
        const { id, title, summary, content } = req.body;
        const postDoc = await Post.findById(id);
        const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
        if (!isAuthor) {
            return res.status(400).json('você não é o autor');
        }
        await postDoc.update({
            title,
            summary,
            content,
            cover: newPath ? newPath : postDoc.cover,
        });

        res.json(postDoc);
    });

});

app.get('/perfil', async (req, res) => {
    try {
        const { token } = req.cookies;
        const decodedToken = jwt.verify(token, secret);
        const user = await User.findById(decodedToken.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const userPosts = await Post.find({ author: user._id });

        res.json({
            username: user.username,
            email: user.email,
            name: user.name,
            age: user.age,
            bio: user.bio,
            posts: userPosts,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar o perfil do usuário' });
    }
});

app.get('/', async (req, res) => {
    res.json(
        await Post.find()
            .populate('author', ['username'])
            .sort({ createdAt: -1 })
            .limit(2000)
    );
});

app.get('/post/:id', async (req, res) => {
    const { id } = req.params;
    const postDoc = await Post.findById(id).populate('author', ['username']);
    res.json(postDoc);
})


const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});