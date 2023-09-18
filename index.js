require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const app = express();
const fs = require('fs');
const path = require('path');
const storage = multer.memoryStorage();
const upload = multer({ storage });
const secret = 'asdfe45we45w345wegw345werjktjwertkj';
const cookieParser = require('cookie-parser');

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configurar o CORS
app.use(cors({ origin: '*', credentials: true }));

// Configurar o cookie-parser
app.use(cookieParser());

app.use(
    cors({
        origin: ['*'],
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        credentials: true,
    })
);

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

//Rota para login de usuário
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
        return res.status(400).json('User not found');
    }
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
        jwt.sign({ username, id: userDoc._id }, secret, { expiresIn: '1h' }, (err, token) => {
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

// Rota para perfil de usuário
app.get("/profile", (req, res) => {
    const { token } = req.cookies;

    if (!token) {
        return res.status(401).json({ error: "Token não fornecido" });
    }
    jwt.verify(token, secret, {}, (err, info) => {
        if (err) {
            return res.status(401).json({ error: "token invalido" });
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

// Rota para listar posts
app.get('/', async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('author', ['username', 'name'])
            .sort({ createdAt: -1 })
            .limit(20000);

        res.json(posts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar os posts' });
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

// Rota para buscar o perfil do usuário com posts ordenados por data decrescente
app.get('/perfil', async (req, res) => {
    try {
        const { token } = req.cookies;
        const decodedToken = jwt.verify(token, secret);
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

app.get("/edit-post/:postId",  async (req, res) => {
    const { postId } = req.params;

    try {

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ error: "Post não encontrado" });
        }


        if (post.author.toString() !== req.user.id) {
            return res.status(403).json({ error: "não autorizado" });
        }

        post.summary = req.body.summary;
        await post.save();

        res.json(post);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error ao atualizar os post" });
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
    console.log(`Servidor rodando na porta ${port}`);
});
