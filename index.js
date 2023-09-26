require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const User = require("./models/User");
const Post = require('./models/Post');
const app = express();
const fs = require('fs');
const path = require('path');
const storage = multer.memoryStorage();
const upload = multer({ storage });
const uploadMiddleware = multer({ dest: 'uploads/' });
const cookieParser = require('cookie-parser');

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configurar o CORS
app.use(cors({
    origin: ['https://pingsocial.vercel.app', 'https://jovial-maamoul-38ed7a.netlify.app'],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
}));

// Configurar o cookie-parser
app.use(cookieParser());

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

// // Rota para criar posts
// app.post('/post', upload.single('file'), async (req, res) => {
//     let coverPath = null;

//     if (req.file) {
//         const { originalname, buffer } = req.file;
//         const parts = originalname.split('.');
//         const ext = parts[parts.length - 1];

//         const filename = `${Date.now()}.${ext}`;
//         const filePath = path.join(__dirname, 'uploads', filename);

//         fs.writeFileSync(filePath, buffer);
//         coverPath = `uploads/${filename}`;
//         console.log('File path:', filePath);
//     }

//     const { token } = req.cookies;
//     // console.log('Token:', token);

//     jwt.verify(token, process.env.JWT_SECRET, {}, async (err, info) => {
//         if (err) {
//             console.error(err);
//             return res.status(401).json({ error: 'Token invalido' });
//         }

//         const { title, summary, content } = req.body;

//         try {
//             const postDoc = await Post.create({
//                 title,
//                 summary,
//                 content,
//                 cover: coverPath,
//                 author: info.id,
//                 name: info.name,
//             });

//             res.status(201).json(postDoc);
//         } catch (error) {
//             console.error(error);
//             res.status(500).json({ error: 'Falha ao gerar o Post' });
//         }
//     });
// });

// Rota para criar posts
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

    const { title, summary, content } = req.body;

    try {
        const postDoc = await Post.create({
            title,
            summary,
            content,
            cover: coverPath,
            name: info.name,
        });

        res.status(201).json(postDoc);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao gerar o Post' });
    }
});


// Rota para listar posts
app.get('/', async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('author', ['username', 'name'])
            .sort({ createdAt: -1 })

        res.json(posts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar os posts' });
    }
});

// Rota para buscar o perfil do usuário com posts ordenados por data decrescente
app.get('/perfil', async (req, res) => {
    try {
        const { token } = req.cookies;
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decodedToken.id);

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Consulta os posts do usuário, ordenando por data decrescente
        const userPosts = await Post.find({ author: user._id })
            // .sort({ createdAt: -1 }); // Ordena por data decrescente
            .sort({ createdAt: 1 }) // Ordena por data crescente

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
        jwt.sign({ username, id: userDoc._id }, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;

            const responseJSON = {
                id: userDoc._id,
                username,
                profileImage: userDoc.profileImage,
            };

            //log para verificar o responseJSON
            console.log('responseJSON:', responseJSON);

            res.cookie('token', token, {
                domain: 'https://pingsocial.vercel.app',
                path: '/',
                httpOnly: true,
                secure: true,
                maxAge: 1296000000,
            }).json(responseJSON);

        });
    } else {
        res.status(400).json('Credenciais erradas');
    }
});

app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok');
});

// Iniciar o servidor na porta especificada
app.listen(process.env.PORT || 5000, () => {
    console.log(`Servidor rodando na porta ${process.env.PORT || 5000}`);
});
