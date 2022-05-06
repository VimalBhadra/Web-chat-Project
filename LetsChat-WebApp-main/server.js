const express = require("express");
const app = express();

const PORT = process.env.PORT || 8000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/", express.static(__dirname + "/public"));

// http for socket
const http = require("http");
const server = http.createServer(app);
const dotParams = require('dotenv');
dotParams.config({path: './routes/.env'});

// fetching socket library
const socketio = require("socket.io");
const io = socketio(server);

// Arrays for maintaing Users
let userOnline = {};
let socketUserMap = {};

//fetching mongo library
const { MongoClient } = require("mongodb");
const mongo_URL = process.env.MONGO_URL;
const DB_name = "letschat";
let userCollection;

// Connecting to the database
(async function () {
    const client = await MongoClient.connect(mongo_URL);
    const letschatDB = client.db(DB_name);
    userCollection = letschatDB.collection("users");
})()
    .then(() => console.log("Successfully connected to DB"))
    .catch((err) => {
        console.error(err);
    });

// Signup POST Request Handler
app.post("/signup", (req, res) => {
    userCollection
        .insertOne({
            username: req.body.signupUsername,
            password: req.body.signupPassword,
            bio: req.body.signupBio,
        })
        .then(() => {
            res.send("User Added Successfully!!");
        })
        .catch((err) => res.send("Some error Occured :( !!"));
});

// async function for retireving user from the database
async function find(name) {
    let data = await userCollection.findOne({ username: name });

    return data;
}

// get request for check Available functionality
app.get("/check", (req, res) => {
    find(req.query.signupUsername)
        .then((item) => {
            if (!item) res.send({ present: false });
            else res.send({ present: true });
        })
        .catch((err) => res.status(500).send({ present: false }));
});

// Post Request handler for User Login
app.post("/login", (req, res) => {
    find(req.body.loginUser)
        .then((item) => {
            if (!item) res.status(200).send({ status: 1 });
            else if (item.password == req.body.loginPassword) {
                res.status(200).send({ status: 3, user: req.body.loginUser });

                userOnline[req.body.loginUser] = item.bio;
            } else res.status(200).send({ status: 2 });
        })
        .catch((err) => res.status(500).send({ status: 4 }));
});

// Listening for the sockets
io.on("connection", (socket) => {
    console.log("user connected with id: ", socket.id);

    socket.on("logged_in", (data) => {
        socket.join(data.user);
        console.log(`${data.user} joined the room`);
        socketUserMap[socket.id] = data.user;

        socket.broadcast.emit("user_joined", {
            total: Object.keys(userOnline).length,
            name: data.user,
            bio: userOnline[data.user],
        });
        // io.emit('user_joined',{users:userOnline.length})
        socket.emit("initialData", { userOnline });
    });

    socket.on("send", (data) => {
        io.to(data.to).emit("received", {
            from: data.from,
            message: data.message,
        });
    });

    socket.on("logged_out", () => {
        // socket.disconnect();
        let name = socketUserMap[socket.id];
        if (name) {
            console.log(`${name} disconnected!!`);
            delete userOnline[name];
            // delete socketUserMap[socket.id];
            socket.leave(name);
            // user disconnected code here!!
            io.emit("user_disconnected", {
                users: Object.keys(userOnline).length,
                name,
            });
        }
    });

    socket.on("disconnect", () => {
        let name = socketUserMap[socket.id];
        if (name) {
            console.log(socket.id, `${name} disconnected!!`);
            // userOnline.filter(data => data.name != socketUserMap[socket.id]);
            delete userOnline[name];
            delete socketUserMap[socket.id];

            // user disconnected code here!!
            io.emit("user_disconnected", {
                users: Object.keys(userOnline).length,
                name,
            });
        }
    });
});

// Listening on http made server
server.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
});
