const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const moment = require("moment-timezone");
//env
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;
const corsOptions = {
  origin: ["http://localhost:5173", "https://edu-manage.netlify.app"],
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
    // await client.connect();
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
    const assignmentCollection = client
      .db("EduManage")
      .collection("Assignments");

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
    // app.get("/users", async (req, res) => {
    //   try {
    //     const result = await userCollection.find().toArray();
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send("Failed to fetch reviews");
    //   }
    // });
    app.get("/users", verifyToken, async (req, res) => {
      const searchQuery = req.query.search || "";
      const filter = {
        $or: [
          { userName: { $regex: searchQuery, $options: "i" } },
          { userEmail: { $regex: searchQuery, $options: "i" } },
        ],
      };

      try {
        const users = await userCollection.find(filter).toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error." });
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
    app.get("/users/profile/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Unauthorized access" });
        }
        const query = { userEmail: email };
        const user = await userCollection.findOne(query);
        res.send({ user });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error", error: error.message });
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
          status: "approved",
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
          res.send(upload);
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
    // app.post("/users/teacher-approve/:id", verifyToken, async (req, res) => {
    //   const id = req.params.id;

    //   const filterById = { _id: new ObjectId(id) };

    //   try {
    //     // Find the approved teacher request
    //     const approvedTeacher = await teacherRequestCollection.findOne(
    //       filterById
    //     );

    //     if (approvedTeacher) {
    //       // Insert into approvedTeacherCollection
    //       const upload = await approvedTeacherCollection.insertOne(
    //         approvedTeacher
    //       );
    //       res.send(upload);
    //       // Delete from teacherRequestCollection
    //       const deleting = await teacherRequestCollection.deleteOne(filterById);

    //       if (upload.acknowledged && deleting.deletedCount > 0) {
    //         res.send({
    //           success: true,
    //           message: "User role updated successfully in both collections.",
    //         });
    //       } else {
    //         res.status(400).send({
    //           success: false,
    //           message:
    //             "Failed to insert into approvedTeacherCollection or delete from teacherRequestCollection.",
    //         });
    //       }
    //     } else {
    //       res.status(400).send({
    //         success: false,
    //         message: "Failed to find the user for approved teacher collection.",
    //       });
    //     }
    //   } catch (error) {
    //     console.error("Error updating user role:", error);
    //     res
    //       .status(500)
    //       .send({ success: false, message: "Internal server error." });
    //   }
    // });

    // Enroll Collection api

    app.post("/enroll-course", verifyToken, async (req, res) => {
      const course = req.body;
      try {
        const result = await courseEnrollCollection.insertOne(course);
        res.send(result);
      } catch (error) {
        console.error("Error enroll:", error);
      }
    });
    // single user enroll info
    app.get("/enroll-info", verifyToken, async (req, res) => {
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
    app.patch("/updateTotalEnrollment/:id", verifyToken, async (req, res) => {
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
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Unauthorized access" });
        }
        const query = { userEmail: email };
        const user = await userCollection.findOne(query);

        let admin = false;
        if (user) {
          admin = user.userRole === "admin";
        }

        res.send({ admin });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Internal server error", error: error.message });
      }
    });

    //Teacher api
    app.post("/teaching-request", verifyToken, async (req, res) => {
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
    app.post(
      "/users/teacher-approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
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
            const deleting = await teacherRequestCollection.deleteOne(
              filterById
            );

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
              message:
                "Failed to find the user for approved teacher collection.",
            });
          }
        } catch (error) {
          console.error("Error updating user role:", error);
          res
            .status(500)
            .send({ success: false, message: "Internal server error." });
        }
      }
    );

    // app.post("/users/teacher-approve/:id", verifyToken, async (req, res) => {
    //   const id = req.params.id;
    //   const filterById = { _id: new ObjectId(id) };
    //   try {
    //     const approvedTeacher = await teacherRequestCollection.findOne(
    //       filterById
    //     );

    //     if (approvedTeacher) {
    //       // Insert into approvedTeacherCollection
    //       const upload = await approvedTeacherCollection.insertOne(
    //         approvedTeacher
    //       );
    //       // Delete from teacherRequestCollection
    //       const deleting = await teacherRequestCollection.deleteOne(filterById);

    //       if (upload.acknowledged && deleting.deletedCount > 0) {
    //         res.send({
    //           success: true,
    //           message: "User role updated successfully in both collections.",
    //         });
    //       } else {
    //         res.status(400).send({
    //           success: false,
    //           message:
    //             "Failed to insert into approvedTeacherCollection or delete from teacherRequestCollection.",
    //         });
    //       }
    //     } else {
    //       res.status(400).send({
    //         success: false,
    //         message: "Failed to find the user for approved teacher collection.",
    //       });
    //     }
    //   } catch (error) {
    //     console.error("Error updating user role:", error);
    //     res
    //       .status(500)
    //       .send({ success: false, message: "Internal server error." });
    //   }
    // });

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

    app.get("/teaching-request", verifyToken, async (req, res) => {
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
        const result = await courseCollection
          .find({ status: "approved" })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch reviews");
      }
    });
    // app.get("/all-pending-courses", async (req, res) => {
    //   try {
    //     const pendingCourses = await courseCollection
    //       .find()
    //       .sort({ status: 1 })
    //       .toArray();
    //     res.send(pendingCourses);
    //   } catch (error) {
    //     res.status(500).send("Failed to fetch courses");
    //   }
    // });

    // Approve Course Endpoint

    app.get("/all-pending-courses", verifyToken, async (req, res) => {
      try {
        const pendingCourses = await courseCollection
          .aggregate([
            {
              $addFields: {
                sortOrder: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$status", "pending"] }, then: 1 },
                      { case: { $eq: ["$status", "approved"] }, then: 2 },
                      { case: { $eq: ["$status", "rejected"] }, then: 3 },
                    ],
                    default: 4,
                  },
                },
              },
            },
            {
              $sort: { sortOrder: 1 },
            },
            {
              $project: { sortOrder: 0 },
            },
          ])
          .toArray();

        res.send(pendingCourses);
      } catch (error) {
        console.error("Error fetching pending courses:", error);
        res.status(500).send("Failed to fetch courses");
      }
    });

    app.patch(
      "/approve-pending-course/:id",
      verifyToken,

      async (req, res) => {
        try {
          const id = req.params.id;
          const filterById = { _id: new ObjectId(id) };
          const updateStatus = { $set: { status: "approved" } };
          const result = await courseCollection.updateOne(
            filterById,
            updateStatus
          );
          if (result) {
            await statsCollection.updateOne(
              { _id: new ObjectId("665ce46ccce6c97b84e3c1a4") },
              { $inc: { totalCourses: 1 } },
              { upsert: true }
            );
          }
          res.send(result);
        } catch (error) {
          res
            .status(500)
            .send({ message: "Internal server error", error: error.message });
        }
      }
    );

    // Reject Course Endpoint
    app.patch(
      "/reject-pending-course/:id",
      verifyToken,

      async (req, res) => {
        try {
          const id = req.params.id;
          const filterById = { _id: new ObjectId(id) };
          const updateStatus = { $set: { status: "rejected" } };
          const result = await courseCollection.updateOne(
            filterById,
            updateStatus
          );
          res.send(result);
        } catch (error) {
          res
            .status(500)
            .send({ message: "Internal server error", error: error.message });
        }
      }
    );

    app.post("/new-course", verifyToken, async (req, res) => {
      try {
        const course = req.body;
        const result = await courseCollection.insertOne(course);
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to add course");
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

    app.get("/teachers-all-course/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      try {
        const courses = await courseCollection.find({ email: email }).toArray();
        if (courses.length === 0) {
          return res.status(404).send({ message: "Courses not found" });
        }
        res.send(courses);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch course details" });
      }
    });
    app.get("/teachers-single-course/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      try {
        const course = await courseCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!course) {
          return res.status(404).send({ message: "Courses not found" });
        }
        res.send(course);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch course details" });
      }
    });

    app.patch("/update-course/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      try {
        const result = await courseCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.modifiedCount === 1) {
          res
            .status(200)
            .send({ success: true, message: "Course updated successfully" });
        } else {
          res.status(404).send({ success: false, message: "Course not found" });
        }
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "An error occurred while updating the course",
        });
      }
    });
    app.delete("/delete-course/:id", verifyToken, async (req, res) => {
      const courseId = req.params.id;
      const query = { _id: new ObjectId(courseId) };
      try {
        const result = await courseCollection.deleteOne(query);
        if (result.deletedCount > 0) {
          res.status(200).json({ deletedCount: result.deletedCount });
        } else {
          res.status(404).json({ message: "Course not found or not deleted" });
        }
      } catch (error) {
        console.error("Error deleting cart Course:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //assignment api

    app.post("/create-assignment", verifyToken, async (req, res) => {
      try {
        const assignment = req.body;
        const result = await assignmentCollection.insertOne(assignment);
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to create assignment");
      }
    });

    app.get("/all-assignment/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      try {
        const assignment = await assignmentCollection
          .find({ courseId: id })
          .toArray();
        if (assignment.length === 0) {
          return res.status(404).send({ message: "Assignment not found" });
        }
        res.send(assignment);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch assignment details" });
      }
    });

    app.get("/per-day-submit/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      try {
        // const currentDate = new Date().toISOString().split("T")[0];
        const currentDate = moment().tz("Asia/Dhaka").format("YYYY-MM-DD");
        const assignments = await assignmentCollection.findOne({
          courseId: id,
          submissionDate: currentDate,
        });
        res.send({ assignments });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch assignment details" });
      }
    });

    app.patch("/submit-assignment/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      // const currentDate = new Date().toISOString().split("T")[0];
      const currentDate = moment().tz("Asia/Dhaka").format("YYYY-MM-DD");
      try {
        const result = await assignmentCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $inc: { perDaySubmissions: 1 },
            $set: { submissionDate: currentDate },
          }
        );
        res.send({ message: "Assignment submitted successfully", result });
      } catch (error) {
        console.error("Error updating assignment:", error);
        res.status(500).send({ message: "Failed to submit assignment", error });
      }
    });

    //  get popular courses based on highest enrollment
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
    app.post("/feedbacks", async (req, res) => {
      try {
        const feedback = req.body;
        if (!feedback.feedbackText || !feedback.rating) {
          return res.status(400).send("Description and rating are required");
        }
        const result = await feedbacksCollection.insertOne(feedback);
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to add feedback");
      }
    });

    app.get("/course-all-feedbacks/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await feedbacksCollection
          .find({ courserId: id })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch reviews");
      }
    });

    // payment intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
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

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
