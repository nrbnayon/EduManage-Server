const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
//env
require("dotenv").config();
const port = process.env.PORT || 5000;
const corsOptions = {
  origin: "http://localhost:5173",
  credentials: true,
};

//middleware
app.use(cors(corsOptions));
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGODB;

//MongoDB
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const userCollection = client.db("EduManage").collection("allUsers");

    //JWT
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(
        user,
        process.env.ACCESS_TOKEN_SECRET,

        { expiresIn: "1h" }
      );
      res.send({ token });
    });

    // Users related API
    app.get("/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch reviews");
      }
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { userEmail: user.email };
      try {
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res
            .status(409)
            .send({ message: "User already exists", insertedId: null });
        } else {
          const result = await userCollection.insertOne(user);
          res.status(201).send(result);
        }
      } catch (error) {
        console.error("Error inserting user:", error);
        res.status(500).send("Failed to insert user");
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Server start
app.get("/", (req, res) => {
  res.send("Server Running");
});

app.listen(port, () => {
  console.log(`Server Running on port ${port}`);
});
