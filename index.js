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
    const teacherRequestCollection = client
      .db("EduManage")
      .collection("TeacherRequest");
    const approvedTeacherCollection = client
      .db("EduManage")
      .collection("Teachers");
    const courseEnrollCollection = client
      .db("EduManage")
      .collection("EnrollCollection");

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
      const isAdmin = user?.userRole === "admin";
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
      const query = { userEmail: user.userEmail };
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

    app.patch("/users/teacher-request/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;
      const filterById = { _id: new ObjectId(id) };
      const filterByEmail = { userEmail: email };

      const updateRole = {
        $set: {
          userRole: "teacher",
          status: "success",
        },
      };

      try {
        const requestUpdateResult = await teacherRequestCollection.updateOne(
          filterById,
          updateRole
        );
        const userUpdateResult = await userCollection.updateOne(
          filterByEmail,
          updateRole
        );
        if (
          requestUpdateResult.modifiedCount > 0 &&
          userUpdateResult.modifiedCount > 0
        ) {
          res.send({
            success: true,
            message: "User role updated successfully in both collections.",
          });
        } else {
          res.status(400).send({
            success: false,
            message: "Failed to update user role in one or both collections.",
          });
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
      }
    });

    // Endpoint to approve a teacher
    app.post("/users/teacher-approve/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const filterById = { _id: new ObjectId(id) };

      try {
        // Find the approved teacher request
        const approvedTeacher = await teacherRequestCollection.findOne(
          filterById
        );

        if (approvedTeacher) {
          // Insert into approvedTeacherCollection
          const upload = await approvedTeacherCollection.insertOne(
            approvedTeacher
          );
          // Delete from teacherRequestCollection
          const deleting = await teacherRequestCollection.deleteOne(filterById);

          if (upload.acknowledged && deleting.deletedCount > 0) {
            res.send({
              success: true,
              message: "User role updated successfully in both collections.",
            });
          } else {
            res.status(400).send({
              success: false,
              message:
                "Failed to insert into approvedTeacherCollection or delete from teacherRequestCollection.",
            });
          }
        } else {
          res.status(400).send({
            success: false,
            message: "Failed to find the user for approved teacher collection.",
          });
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
      }
    });

    // Enroll Collection api

    app.post("/enroll-course", async (req, res) => {
      const course = req.body;
      try {
        const result = await courseEnrollCollection.insertOne(course);
        res.send(result);
      } catch (error) {
        console.error("Error enroll:", error);
      }
    });
    // single user enroll info
    app.get("/enroll-info", async (req, res) => {
      const email = req.query.studentEmail;
      const query = { studentEmail: email };
      try {
        const result = await courseEnrollCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch Course ");
      }
    });

    // total enrollment api
    app.patch("/updateTotalEnrollment/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      try {
        // Find the course
        const course = await courseCollection.findOne(filter);
        if (!course) {
          return res.status(404).send("Course not found");
        }

        // Update the totalEnrollment for the specific course
        const updateCourseEnrollment = await courseCollection.updateOne(
          filter,
          {
            $inc: { totalEnrollment: 1 },
            // upsert: true,
          }
        );

        // Check if the course enrollment update was successful
        if (updateCourseEnrollment.modifiedCount === 0) {
          return res.status(500).send("Failed to update course enrollment");
        }

        // Update the totalEnrollments in the stats collection
        const updateTotalEnrollment = await statsCollection.updateOne(
          { _id: new ObjectId("665ce46ccce6c97b84e3c1a4") },
          { $inc: { totalEnrollments: 1 } },
          { upsert: true }
        );

        res.send(updateTotalEnrollment);
      } catch (error) {
        console.error(error);
        res.status(500).send("Failed to update total enrollment student");
      }
    });

    //create admin api
    app.patch("/users/admin/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateRole = {
        $set: {
          userRole: "admin",
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
        const query = { userEmail: email };
        const user = await userCollection.findOne(query);

        let admin = false;
        if (user) {
          admin = user.userRole === "admin";
        }

        // Send a JSON response
        res.send({ admin });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error", error: error.message });
      }
    });

    //Teacher api
    app.post("/teaching-request", async (req, res) => {
      const request = req.body;
      try {
        const result = await teacherRequestCollection.insertOne(request);
        res.send(result);
      } catch (error) {
        console.error("Error enroll:", error);
        res.status(500).send({ error: "Failed to submit teaching request" });
      }
    });

    //  approve a teacher
    app.post("/users/teacher-approve/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filterById = { _id: new ObjectId(id) };
      try {
        const approvedTeacher = await teacherRequestCollection.findOne(
          filterById
        );

        if (approvedTeacher) {
          // Insert into approvedTeacherCollection
          const upload = await approvedTeacherCollection.insertOne(
            approvedTeacher
          );
          // Delete from teacherRequestCollection
          const deleting = await teacherRequestCollection.deleteOne(filterById);

          if (upload.acknowledged && deleting.deletedCount > 0) {
            res.send({
              success: true,
              message: "User role updated successfully in both collections.",
            });
          } else {
            res.status(400).send({
              success: false,
              message:
                "Failed to insert into approvedTeacherCollection or delete from teacherRequestCollection.",
            });
          }
        } else {
          res.status(400).send({
            success: false,
            message: "Failed to find the user for approved teacher collection.",
          });
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
      }
    });

    app.patch("/users/teacher-reject/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filterById = { _id: new ObjectId(id) };
      try {
        const updateStatus = {
          $set: {
            status: "reject",
          },
        };
        const result = await teacherRequestCollection.updateOne(
          filterById,
          updateStatus
        );
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error", error: error.message });
      }
    });

    app.get("/users/teacher/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Unauthorized access" });
        }
        const query = { userEmail: email };
        const user = await userCollection.findOne(query);
        const apply = await teacherRequestCollection.findOne({ email });
        let teacher = false;
        let status = "";
        if (user) {
          teacher = user.userRole === "teacher";
        }
        if (apply) {
          status = apply?.status;
        }
        res.send({ teacher, status });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error", error: error.message });
      }
    });
    // reapply for teaching
    app.patch(
      "/teaching-request/reapply/:email",
      verifyToken,
      async (req, res) => {
        try {
          const email = req.params.email;

          if (email !== req.decoded.email) {
            return res.status(403).send({ message: "Unauthorized access" });
          }

          const query = { email };
          const update = { $set: { status: "pending" } };

          const result = await teacherRequestCollection.updateOne(
            query,
            update
          );

          if (result.modifiedCount > 0) {
            const updatedDoc = await teacherRequestCollection.findOne(query);
            res.send({
              success: true,
              message: "Reapplication submitted successfully.",
              data: updatedDoc,
            });
          } else {
            res.status(404).send({
              success: false,
              message: "No application found for this email.",
            });
          }
        } catch (error) {
          res.status(500).send({
            success: false,
            message: "Internal server error",
            error: error.message,
          });
        }
      }
    );

    app.get("/teaching-request", async (req, res) => {
      try {
        const result = await teacherRequestCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error loading teaching requests:", error);
        res.status(500).send({ error: "Failed to load teaching requests" });
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
      console.log("id", id);
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
