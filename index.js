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
        origin: ['https://jovial-maamoul-38ed7a.netlify.app','https://pingsocial.vercel.app', 'http://192.168.0.112:3000', 'http://localhost:3000'],
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
console.log(process.env.MONGODB_URI);
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch(err => {
        console.error("MongoDB connection error:", err);
    });

// Rota para registro de usuário

//test
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
        console.log(userDoc);
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: 'Erro no cadastro' });
    }
});

// Rota para login de usuário
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const userDoc = await User.findOne({ username });

    if (!userDoc) {
        return res.status(400).json("Falha ao realizar o Login");
    }

    const passOk = bcrypt.compareSync(password, userDoc.password);

    if (passOk) {
        jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
            if (err) throw err;

            const responseJSON = {
                id: userDoc._id,
                username,
                profileImage: userDoc.profileImage,
            };

            res.cookie('token', token).json(responseJSON);
        });
    } else {
        res.status(400).json("Falha ao realizar o Login");
    }
});

// Rota para perfil de usuário
// app.get('/profile', (req, res) => {
//     const { token } = req.cookies;
//     jwt.verify(token, secret, {}, (err, info) => {
//         if (err) throw err;
//         res.json(info);
//     });
// });

app.get("/profile", (req, res) => {
    const { token } = req.cookies;

    if (!token) {
        return res.status(401).json({ error: "Token not provided" });
    }
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) {
            return res.status(401).json({ error: "Invalid token" });
        }
        res.json(info);
    });
});


// Rota para logout de usuário
app.post('/logout', (req, res) => {
    res.cookie('token', '').json('ok');
});

// Rota para criar um post
app.post('/create-post', upload.single('file'), async (req, res) => {
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

    jwt.verify(token, secret, {}, async (err, info) => {
        if (err) {
            return res.status(401).json({ error: 'Token inválido' });
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
            res.status(500).json({ error: 'Erro ao criar a postagem' });
        }
    });
});

// Rota para listar posts
app.get('/', async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('author', ['username', 'name'])
            .sort({ createdAt: -1 })
            .limit(20);

        res.json(posts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar os posts' });
    }
});

// Rota para buscar o perfil do usuário
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

// Rota para atualizar o perfil do usuário
app.put('/profile', async (req, res) => {
    try {
        const userId = req.user.id;
        const { username } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { username },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        res.status(200).json({ username: updatedUser.username });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar o nome de perfil do usuário' });
    }
});

// Rota para a edição de postagens (HTTP PUT)
app.get("/edit-post/:postId",  async (req, res) => {
    const { postId } = req.params;

    try {
        // Consulte o banco de dados para obter os detalhes da postagem com base no postId
        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Verifique se o usuário autenticado é o autor da postagem
        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Atualize os campos da postagem com base nos dados recebidos na solicitação PUT
        post.summary = req.body.summary;
        // Atualize outros campos, se necessário

        // Salve a postagem atualizada no banco de dados
        await post.save();

        // Envie a postagem atualizada como resposta
        res.json(post);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error updating post" });
    }
});


// Rota para obter um post por ID
app.get('/post/:id', async (req, res) => {
    const { id } = req.params;
    const postDoc = await Post.findById(id).populate('author', ['username']);
    res.json(postDoc);
});
   

const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
