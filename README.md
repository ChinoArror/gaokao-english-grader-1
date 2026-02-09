# Gaokao English Grader - AI Essay Grading System

A comprehensive AI-powered English essay grading system designed for Gaokao (高考) exams, featuring advanced user management, grading history, and transcription capabilities.

## 🚀 Features

### Authentication & User Management
- **Multi-user Support**: Separate admin and user roles with secure authentication
- **Admin Dashboard**: Manage users - create, update, and delete user accounts
- **Session Management**: Secure token-based authentication with automatic session persistence
- **Password Protection**: SHA-256 hashed passwords for user accounts

### Essay Grading
- **Dual Input Methods**: 
  - Manual text input for questions and essays
  - Image upload support for handwritten essays (OCR-enabled)
- **AI-Powered Analysis**: Powered by Google Gemini 3.0 Pro Preview
- **Essay Types Supported**:
  - Practical Writing (应用文) - 15 points
  - Continuation Writing (读后续写) - 25 points
- **Transcription Feature**: Automatic text extraction from uploaded images with floating viewer

### History & Records
- **Grading History**: Complete record of all graded essays with timestamps
- **Record Management**: View, export, and delete historical grading records
- **Export Options**: 
  - Download as Markdown (.md)
  - Print-friendly format
- **User-Specific Access**: Users see only their own records; admins see all

### User Experience
- **Responsive Design**: Optimized for mobile and desktop devices
- **Modern UI**: Glass-morphism design with smooth animations and transitions
- **Real-time Feedback**: Loading states and error handling
- **Floating Transcription Viewer**: Easy access to OCR results without cluttering the main interface

## 🔧 Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Marked.js** for Markdown rendering
- **Vite** for build tooling

### Backend
- **Cloudflare Workers** for serverless compute
- **D1 Database** for persistent storage
- **Google Gemini 3.0** for AI grading

## 📦 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gaokao-english-grader
```

2. Install dependencies:
```bash
npm install
```

3. Initialize the database:
```bash
npx wrangler d1 execute gaokao-en-grader-db --remote --file=schema.sql
```

4. Configure environment variables in `wrangler.toml` or Cloudflare Dashboard:
- `API_KEY`: Your Google Gemini API key (stored as secret)
- `ADMIN_USERNAME`: Admin login username (default: "admin")
- `ADMIN_PASSWORD`: Admin login password (default: "admin123")
- `MODEL_NAME`: Gemini model to use (default: "gemini-3-pro-preview")

5. Set the API key secret:
```bash
npx wrangler secret put API_KEY
# Enter your Gemini API key when prompted
```

## 🚀 Deployment

1. Build the frontend:
```bash
npm run build
```

2. Deploy to Cloudflare Workers:
```bash
npx wrangler deploy
```

3. Access your app at: **https://eng.aryuki.com**

## 📖 Usage

### For Administrators

1. **Login**: Use admin credentials (default: admin/admin123)
2. **User Management**:
   - View all registered users
   - Add new users with username and password
   - Edit existing user credentials
   - Delete user accounts
3. **Access Grader**: Navigate to grader from admin dashboard
4. **View All History**: See grading records from all users

### For Users

1. **Login**: Enter your username and password
2. **Grade Essays**:
   - Select essay type (Practical/Continuation)
   - Choose input method (Text/Image)
   - Enter or upload essay content
   - Click "Start AI Grading"
3. **View Results**:
   - Read AI feedback and scores
   - View transcription (for image uploads) via floating button
   - Export as Markdown or print
4. **Check History**:
   - Click "History" button in header
   - View all your past grading records
   - Export or delete individual records

## 🗄️ Database Schema

### Users Table
- `id`: Primary key
- `username`: Unique username
- `password`: SHA-256 hashed password
- `created_at`: Unix timestamp

### History Table
- `id`: Primary key
- `user_id`: Foreign key to users table
- `timestamp`: Unix timestamp
- `topic`: Essay question/topic
- `original_content`: Transcribed or inputted text
- `feedback`: AI-generated grading feedback

### Sessions Table
- `token`: Primary key (UUID)
- `user_id`: Foreign key to users (NULL for admin)
- `role`: 'admin' or 'user'
- `created_at`: Unix timestamp
- `expires_at`: Unix timestamp (7 days from creation)

## 🎨 Design Philosophy

The application maintains a consistent design language throughout:
- **Color Scheme**: Indigo/Blue gradients for primary actions
- **Glass-morphism**: Backdrop blur effects on cards
- **Smooth Animations**: Hover effects, scale transforms
- **Responsive Layout**: Mobile-first design approach
- **Accessibility**: Clear labels, keyboard navigation support

## 🔐 Security Features

1. **Password Hashing**: User passwords stored as SHA-256 hashes
2. **Session Tokens**: Cryptographically secure UUIDs
3. **API Key Protection**: Gemini API key stored as Cloudflare secret
4. **CORS Protection**: Configured for secure cross-origin requests
5. **Input Validation**: Server-side and client-side validation

## 🔄 API Endpoints

### Authentication
- `POST /api/auth/login` - User/admin login
- `POST /api/auth/logout` - Session logout
- `GET /api/auth/verify` - Verify session token

### Admin (requires admin role)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### History
- `GET /api/history` - Get user's grading history
- `DELETE /api/history/:id` - Delete history record

### Grading
- `POST /api/grade` - Submit essay for grading (saves to history)

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY` | Google Gemini API Key | (required, stored as secret) |
| `API_DOMAIN` | Gemini API domain | generativelanguage.googleapis.com |
| `MODEL_NAME` | Gemini model | gemini-3-pro-preview |
| `ADMIN_USERNAME` | Admin login username | admin |
| `ADMIN_PASSWORD` | Admin login password | admin123 |

## ⚠️ Important Notes

1. **Change Default Admin Password**: For security, change the default admin credentials after first deployment
2. **Database**: The D1 database must be initialized before first use
3. **API Key**: Ensure your Gemini API key has access to the specified model
4. **Browser Compatibility**: Designed for modern browsers with ES6+ support

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows existing style conventions
- New features include appropriate documentation
- Frontend changes maintain responsive design
- Backend changes include proper error handling

## 📄 License

This project is proprietary software. All rights reserved.

## 🙋 Support

For issues or questions:
1. Check the database schema is properly initialized
2. Verify API key is correctly configured
3. Check browser console for client-side errors
4. Review Cloudflare Workers logs for server errors

---

**Powered by Google Cloud & Gemini 3.0**
