const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
//env
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    const courseCollection = client.db("EduManage").collection("allCourses");
    const feedbacksCollection = client.db("EduManage").collection("feedbacks");
    const statsCollection = client.db("EduManage").collection("stats");

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

    // verify token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" });
        } else {
          req.decoded = decoded;
          next();
        }
      });
    };

    //verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Users related API
    app.get("/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch reviews");
      }
    });
    app.get("/state", async (req, res) => {
      try {
        const result = await statsCollection.find().toArray();
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
          await statsCollection.updateOne(
            { _id: new ObjectId("665ce46ccce6c97b84e3c1a4") },
            { $inc: { totalUsers: 1 } },
            { upsert: true }
          );

          res.status(201).send(result);
        }
      } catch (error) {
        console.error("Error inserting user:", error);
        res.status(500).send("Failed to insert user");
      }
    });

    //create admin api
    app.patch("/users/admin/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateRole = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateRole);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // Check if the email in the request matches the email in the token
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Unauthorized access" });
        }

        // Query the database for the user by email
        const query = { email: email };
        const user = await userCollection.findOne(query);

        let admin = false;
        if (user) {
          admin = user.role === "admin";
        }

        // Send a JSON response
        res.send({ admin });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error", error: error.message });
      }
    });

    //All Course related Api
    app.get("/allCourse", async (req, res) => {
      try {
        const result = await courseCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch reviews");
      }
    });

    app.get("/courseDetails/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const course = await courseCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!course) {
          return res.status(404).send({ message: "Course not found" });
        }
        res.send(course);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch course details" });
      }
    });
    // Endpoint to get popular courses based on highest enrollment
    app.get("/popular-courses", async (req, res) => {
      try {
        const result = await courseCollection
          .find()
          .sort({ totalEnrollment: -1 })
          .limit(5)
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch popular courses");
      }
    });

    //feedbacks api
    app.get("/feedbacks", async (req, res) => {
      try {
        const result = await feedbacksCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch reviews");
      }
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
        // automatic_payment_methods: {
        //   enabled: true,
        // },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
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
