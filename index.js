const dotenv = require('dotenv');
const express = require('express');
const app = express();
const admin = require('./firebaseAdmin')
const cors = require('cors');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const pendingUser = new Map();
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

dotenv.config();
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}))
app.use(express.json())

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'mejerabxd@gmail.com',
        pass: 'wtvj kvua khys kstl',
    }
})
let tempStorage = {};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xegw8vb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
    }
});

const userCollection = client.db('quiet-beats').collection('users');
const songCollection = client.db('quiet-beats').collection('uploads');
const PlaylistCollection = client.db('quiet-beats').collection('playlists');

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        app.post('/send-email', async (req, res) => {
            const data = req.body;
            const secret = speakeasy.generateSecret({ length: 6 });
            const token = speakeasy.totp({
                secret: secret.base32,
                encoding: 'base32',
                step: 300
            })
            tempStorage = secret.base32;
            const mailOptions = {
                from: 'Quiet Beats',
                to: data.email,
                subject: "Verify It's You",
                html: `<div style="background: black; color: black; padding: 12px;" className="bg-white text-black py-12">
                <div style="background-color: black; width: fit-content; margin: auto; padding: 36px; border-radius: 12px;">
                    <img style="width: 200px; margin: auto;" src="https://i.ibb.co.com/vvrz332g/Logo-1.png" alt="">
                    <h3 style="text-align: center; font-size: 30px; font-weight: 600; color: #49DC67">Verify It's You</h3>
                    <h4 style="color: #121212; background: #49DC67; font-size: 20px; margin-top: 15px; border-radius: 12px; text-align: center; padding: 15px">${token}</h4>
                </div>
            </div>`
            }
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.log('mail error', err);
                }
                if (info) {
                    console.log(info.response);
                }
            })
            res.send({ success: true })
        })
        app.post('/verify', async (req, res) => {
            // if (data?.provider === 'google.com' || 'facebook.com') {
            //     const result = await userCollection.insertOne(data);
            //     return res.send(result);
            // }
            const { email, otp } = req.body;
            const secret = tempStorage;
            if (!secret) return res.status(400).send({ message: 'No OTP found' })
            const verify = speakeasy.totp.verify({
                secret,
                encoding: 'base32',
                token: otp,
                step: 300
            })
            if (!verify) return res.send({ message: 'Invalid or expired OTP' });
            const exist = await userCollection.findOne({ email });
            if (exist) {
                const firebaseToken = await admin.auth().createCustomToken(email);
                return res.send({ message: 'Otp verified', success: true, token: firebaseToken });
            }
            else {
                res.send({ message: 'Otp verified', success: true, })
            }
        })
        app.post('/add-user', async (req, res) => {
            const body = req.body;
            body.provider = 'email';
            const result = await userCollection.insertOne(body);
            res.send(result);
        })
        app.post('/exist/:email', async (req, res) => {
            const { email } = req.params;
            const result = await userCollection.findOne({ email });
            if (result) {
                return res.send({ success: true })
            }
            res.send({ success: false });
        })
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })
        app.get('/user/:email', async (req, res) => {
            const { email } = req.params;
            const result = await userCollection.findOne({ email });
            res.send(result);
        })
        app.get('/users/:email', async (req, res) => {
            const email = req.params;
            const result = await userCollection.findOne(email);
            res.send(result);
        })

        // Audio posting

        const upload = multer({ dest: 'uploads/' });

        app.post("/upload", upload.single("file"), async (req, res) => {
            const { album, albumPhoto, artist, feat, publisher, genre, language, lovedBy } = req.body;
            console.log("Received file:", albumPhoto); // ✅ Should show file info

            if (!req.file) {
                return res.status(400).json({ error: "No file received" });
            }
            try {
                const catForm = new FormData();
                catForm.append("reqtype", "fileupload");
                catForm.append("fileToUpload", fs.createReadStream(req.file.path));
                const catResponse = await axios.post("https://catbox.moe/user/api.php", catForm, {
                    headers: catForm.getHeaders(),
                });
                fs.unlinkSync(req.file.path); // clean up
                const count = (await songCollection.find().toArray()).length;
                const data = {
                    album, image: albumPhoto, genre, artist, publisher, song: catResponse.data, language, lovedBy: [], count: count + 1
                }
                if (feat) data.feat = feat;
                if (catResponse.data) {
                    const result = await songCollection.insertOne(data);
                    res.send(result);
                }
                else {
                    res.send({ alert: 'insertation problem' });
                }
            } catch (err) {
                console.error("Upload error:", err);
                res.status(500).send({ error: "Upload failed" });
            }
        });
        app.get('/uploads', async (req, res) => {
            const result = await songCollection.find().toArray();
            res.send(result);
        })
        app.get('/uploads/:id', async (req, res) => {
            const { id } = req.params;
            const filter = { _id: new ObjectId(id) };
            const result = await songCollection.findOne(filter);
            res.send(result);
        })
        app.patch('/update-likes/:id', async (req, res) => {
            const { id } = req.params;
            const body = req.body;
            const filter = { _id: new ObjectId(id) };
            try {
                let done = 0;
                if (body.action === 'place') {
                    const update = {
                        $addToSet: { lovedBy: body.send }
                    }
                    const addRes = await songCollection.updateOne(filter, update);
                    addRes.modifiedCount && done++;
                }
                else if (body.action === 'remove') {
                    const update = {
                        $pull: { lovedBy: body.send }
                    }
                    const removeRes = await songCollection.updateOne(filter, update);
                    removeRes.modifiedCount && done++;
                }
                if (done) {
                    res.send({ success: true })
                }
            } catch (error) {
                console.log('Error', error);
            }
        })
        app.get('/liked-songs/:email', async (req, res) => {
            const { email } = req.params;
            const result = await songCollection.find({ lovedBy: email }).toArray();
            res.send(result);
        })
        app.patch('/songs/listened/:id', async (req, res) => {
            const { id } = req.params;
            const { user } = req.body;
            const result = await songCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $push: { views: user }
                }
            )
            if (result) {
                res.send({ update: true });
            }
        })

        // Songs based on different tastes

        app.get('/sorting', async (req, res) => {
            const { type } = req.query;
            if (type === 'latests') {
                const result = await songCollection.find().limit(10).toArray();
                res.send(result);
            }
            else if (type === 'top-rated') {
                const result = await songCollection.aggregate([
                    { $addFields: { viewCount: { $size: { $ifNull: ["$views", []] } } } },
                    { $sort: { viewCount: -1 } }
                ]).toArray();
                res.send(result);
            }
        })

        // Genre
        app.get('/songs/genre/:genre/:id', async (req, res) => {
            const { genre, id } = req.params;
            const { limit } = req.query;
            const find = await songCollection.find({ genre }).limit(parseInt(limit) + 1).toArray();
            const result = find.filter(song => song._id.toString() !== id);
            res.send(result);
        })

        // Most Favourite
        app.get('/most-favourite/:email', async (req, res) => {
            const { email } = req.params;
            const result = await songCollection.aggregate([
                {
                    $set: {
                        viewCount: {
                            $size: {
                                $filter: {
                                    input: {$ifNull: ["$views", []]},
                                    as: 'view',
                                    cond: { $eq: ["$$view", email] }
                                }
                            }
                        }
                    }
                },
                {
                    $match: {
                        viewCount: { $gt: 0 }
                    }
                },
                {
                    $sort: { viewCount: -1 }
                },
                {
                    $limit: 3
                },
                {
                    $unset: 'viewCount'
                }
            ]).toArray();
            res.send(result);
        })
        // Playlists

        app.post('/playlists', async (req, res) => {
            const data = req.body;
            const result = await PlaylistCollection.insertOne(data);
            res.send(result);
        })
        app.get('/playlists', async (req, res) => {
            const result = await PlaylistCollection.find().toArray();
            res.send(result);
        })
        app.get('/playlists/:email', async (req, res) => {
            const { id, email } = req.params;
            const result = await PlaylistCollection.find({ userEmail: email }).toArray();
            res.send(result);
        })
        app.get('/playlist/:id', async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const result = await PlaylistCollection.findOne(query);
            res.send(result);
        })

        // Personal Playlists

        app.get('/playlist/:id/songs', async (req, res) => {
            const { id } = req.params;
            try {
                const playlist = await PlaylistCollection.findOne({ _id: new ObjectId(id) });
                if (!playlist) return res.status(404).send("Can't find songs");
                const Ids = playlist.songs.map(item => new ObjectId(item))
                const songs = await songCollection.find({
                    _id: { $in: Ids }
                }).toArray();
                res.send(songs);
            } catch (error) {
                console.log(error);
            }
        })

        app.get('/playlists/search/:email', async (req, res) => {
            const { email } = req.params;
            const { query } = req.query;
            if (!query) {
                const result = await PlaylistCollection.find({ userEmail: email }).toArray();
                return res.send(result);
            };
            const results = await PlaylistCollection.find({
                userEmail: email,
                name: { $regex: query, $options: 'i' }
            }).toArray();
            res.send(results);
        })

        app.patch('/playlists/update-song', async (req, res) => {
            const { songId, addTo, removeFrom } = req.body;
            let done = 0;
            try {
                if (Array.isArray(addTo) && addTo.length) {
                    const addId = addTo.map(id => new ObjectId(id))
                    const addRes = await PlaylistCollection.updateMany(
                        { _id: { $in: addId } },
                        { $addToSet: { songs: songId } }
                    )
                    if (addRes.modifiedCount) {
                        done++;
                    }
                }
                if (Array.isArray(removeFrom) && removeFrom.length) {
                    const removeId = removeFrom.map(id => new ObjectId(id));
                    const removeRes = await PlaylistCollection.updateMany(
                        { _id: { $in: removeId } },
                        { $pull: { songs: songId } }
                    )
                    if (removeRes.modifiedCount) {
                        done++;
                    }
                }
                if (done) {
                    res.send({ success: true });
                }
            } catch (error) {
                res.send('Error:', error)
            }
        })

        // Search
        app.get('/search', async (req, res) => {
            const { query } = req.query;
            if (!query) return res.send([]);
            const results = await songCollection.find({
                $or: [
                    { album: { $regex: query, $options: 'i' } },
                    { artist: { $regex: query, $options: 'i' } },
                    { genre: { $regex: query, $options: 'i' } },
                    { feat: { $regex: query, $options: 'i' } },
                    { language: { $regex: query, $options: 'i' } },
                ]
            }).limit(5).toArray();
            res.send(results);
        });

        // Artist
        app.get('/artist/songs/:name', async (req, res) => {
            const { name } = req.params;
            const data = name.replace('_', ' ');
            const results = await songCollection.find({
                $or: [
                    { artist: { $regex: data, $options: 'i' } },
                    { feat: { $regex: data, $options: 'i' } },
                ]
            }).toArray();
            res.send(results);
        })

    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Server is beating');
})

app.listen(port, () => {
    console.log('Server working');
})