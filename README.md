# EduManage Server

This is the server-side application for the EduManage platform, built with Node.js, Express, and MongoDB.

## Features

- User Authentication and Authorization (JWT)
- Role-based access control (Admin, Teacher, Student)
- Manage Classes (Create, Read, Update, Delete)
- Handle Teacher Requests
- Manage Payments (Stripe)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Stripe Account

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/nrbnayon/edumanage-server.git
   cd edumanage-server
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Create a `.env` file in the root directory and add the following variables:
   ```env
   PORT=5000
   MONGODB=mongodb+srv://username:password@cluster0.mongodb.net/your-database-name
   ACCESS_TOKEN_SECRET=your_super_secret_key
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
   ```

### Running the Server

Start the server in development mode:

```sh
node index.js
```

The server will start on `http://localhost:5000`.

## API Endpoints

### Authentication

- **POST** `/api/auth/register` - Register a new user
- **POST** `/api/auth/login` - Login a user

### User Management

- **GET** `/api/users` - Get all users (Admin only)
- **PATCH** `/api/users/:id/make-admin` - Make a user an admin (Admin only)

### Classes

- **GET** `/api/classes` - Get all classes
- **POST** `/api/classes` - Create a new class (Teacher only)
- **PATCH** `/api/classes/:id` - Update a class (Teacher only)
- **DELETE** `/api/classes/:id` - Delete a class (Teacher only)

### Teacher Requests

- **GET** `/api/teacher-requests` - Get all teacher requests (Admin only)
- **PATCH** `/api/teacher-requests/:id/approve` - Approve a teacher request (Admin only)
- **PATCH** `/api/teacher-requests/:id/reject` - Reject a teacher request (Admin only)

### Payments

- **POST** `/api/payments` - Create a new payment

## License

This project is licensed under the MIT License.
