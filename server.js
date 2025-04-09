const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const xlsx = require('xlsx');
require('dotenv').config();
const cors = require('cors');
const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES({ apiVersion: '2010-12-01' });

const app = express();
app.use(express.json());
app.use(express.static('public'));

const corsOptions = {
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:7000'
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// DynamoDB Table Names
const USER_TABLE = 'Users';
const ATTENDANCE_TABLE = 'Attendance';

// Helper Functions
const generateId = () => AWS.util.uuid.v4();

// Function to send email using SES
const sendEmail = async (toAddresses, subject, message) => {
  const params = {
    Destination: {
      ToAddresses: Array.isArray(toAddresses) ? toAddresses : [toAddresses],
    },
    Message: {
      Body: {
        Text: { Data: message },
      },
      Subject: { Data: subject },
    },
    Source: process.env.SES_SENDER_EMAIL,
  };

  try {
    const data = await ses.sendEmail(params).promise();
    console.log("Email sent:", data.MessageId);
    return data;
  } catch (error) {
    console.error("SES Error:", error);
    throw error;
  }
};

// Login Route (updated response messages)
app.post('/login', async (req, res) => {
  const { email, registrationNumber, password } = req.body;
  
  if (!email || !registrationNumber || !password) {
    return res.status(400).json({ msg: 'All fields are required' });
  }

  const params = {
    TableName: USER_TABLE,
    FilterExpression: 'email = :email AND registrationNumber = :reg',
    ExpressionAttributeValues: {
      ':email': email,
      ':reg': registrationNumber
    }
  };
  
  try {
    const data = await dynamodb.scan(params).promise();
    if (data.Items.length === 0) {
      return res.status(401).json({ msg: 'Account not found. Please check your credentials.' });
    }
    
    const user = data.Items[0];
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ msg: 'Incorrect password. Please try again.' });
    }
    
    const token = jwt.sign({ userId: user.id, userRole: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ 
      token, 
      role: user.role,
      msg: 'Login successful' 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ msg: 'Server error during login. Please try again.' });
  }
});

// Middleware to Protect Routes
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403);
    req.user = {
      userId: decoded.userId,
      role: decoded.userRole
    };
    next();
  });
};

// Get Events and User Attendance Status
app.get('/user/events', authenticateToken, async (req, res) => {
  try {
    const params = {
      TableName: ATTENDANCE_TABLE
    };
    
    const data = await dynamodb.scan(params).promise();
    const events = data.Items;
    
    const userAttendance = events.map(event => {
      const userRecord = event.records?.find(
        r => r.studentId === req.user.userId
      );

      return {
        eventName: event.eventName,
        eventDate: event.eventDate,
        eventStartTime: event.eventStartTime,
        eventEndTime: event.eventEndTime,
        status: userRecord ? userRecord.status : 'Not marked',
      };
    }).filter(Boolean);

    res.json(userAttendance);
  } catch (error) {
    console.error('Error fetching user events:', error);
    res.status(500).json({ message: 'Error fetching events' });
  }
});

// Get Student List (Admin)
app.get('/admin/students', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  
  try {
    const params = {
      TableName: USER_TABLE,
      FilterExpression: '#userRole = :roleValue',
      ExpressionAttributeNames: {
        '#userRole': 'role'
      },
      ExpressionAttributeValues: {
        ':roleValue': 'user'
      },
      ProjectionExpression: 'id, #name, email, registrationNumber',
      ExpressionAttributeNames: {
        '#userRole': 'role',
        '#name': 'name'
      }
    };
    
    const data = await dynamodb.scan(params).promise();
    res.json(data.Items);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});

// Post Attendance (Admin)
app.post('/admin/post-attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can post attendance' });
  }
  const { eventName, eventDate, attendance } = req.body;
  
  if (!eventName || !eventDate) {
    return res.status(400).json({ message: 'Event name and date are required' });
  }

  if (!attendance || attendance.length === 0) {
    return res.status(400).json({ message: 'No attendance records provided' });
  }

  // Check if event exists
  const checkParams = {
    TableName: ATTENDANCE_TABLE,
    Key: {
      eventName,
      eventDate
    }
  };
  
  try {
    const existing = await dynamodb.get(checkParams).promise();
    if (existing.Item) {
      return res.status(400).json({ message: 'Event with this name and date already exists' });
    }
    
    // Create attendance record
    const putParams = {
      TableName: ATTENDANCE_TABLE,
      Item: {
        eventName,
        eventDate,
        records: attendance
      }
    };
    
    await dynamodb.put(putParams).promise();
    
    // Send email to admin
    const adminSubject = `Attendance Posted for ${eventName}`;
    const adminMessage = `Attendance has been successfully posted for event: ${eventName} on ${eventDate}.`;
    
    // Get admin email
    const adminParams = {
      TableName: USER_TABLE,
      FilterExpression: '#userRole = :roleValue',
      ExpressionAttributeNames: {
        '#userRole': 'role'
      },
      ExpressionAttributeValues: {
        ':roleValue': 'admin'
      },
      ProjectionExpression: 'email'
    };
    
    const adminData = await dynamodb.scan(adminParams).promise();
    const adminEmails = adminData.Items.map(admin => admin.email);
    
    if (adminEmails.length > 0) {
      await sendEmail(adminEmails, adminSubject, adminMessage);
    }
    
    res.json({ message: 'Attendance posted successfully' });
  } catch (err) {
    console.error('Error posting attendance:', err);
    res.status(500).json({ message: 'Error posting attendance' });
  }
});

// View Attendance (Admin)
app.get('/admin/view-attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  const { eventName, eventDate } = req.query;
  
  if (!eventName || !eventDate) {
    return res.status(400).json({ message: 'Missing required query parameters' });
  }

  try {
    const params = {
      TableName: ATTENDANCE_TABLE,
      Key: {
        eventName,
        eventDate
      }
    };
    
    const attendanceData = await dynamodb.get(params).promise();
    
    if (!attendanceData.Item) {
      return res.status(404).json({ message: "This event does not exist." });
    }
    
    // Get user details for each record
    const recordsWithUserDetails = await Promise.all(
      attendanceData.Item.records.map(async record => {
        const userParams = {
          TableName: USER_TABLE,
          Key: {
            id: record.studentId
          }
        };
        
        const userData = await dynamodb.get(userParams).promise();
        
        return {
          _id: record.studentId,
          name: userData.Item?.name || "Name not found",
          registrationNumber: userData.Item?.registrationNumber || "Registration not found",
          email: userData.Item?.email || "Email id not found",
          status: record.status
        };
      })
    );
    
    res.json(recordsWithUserDetails);
  } catch (error) {
    console.error('Error viewing attendance:', error);
    res.status(500).json({ message: 'Error viewing attendance' });
  }
});

// Download Attendance as Excel (Admin)
app.get('/admin/download-attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  const { eventName, eventDate } = req.query;
  
  if (!eventName || !eventDate) {
    return res.status(400).json({ message: 'Missing required query parameters' });
  }

  try {
    const params = {
      TableName: ATTENDANCE_TABLE,
      Key: {
        eventName,
        eventDate
      }
    };
    
    const attendanceData = await dynamodb.get(params).promise();
    
    if (!attendanceData.Item) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    // Get user details for each record
    const recordsWithUserDetails = await Promise.all(
      attendanceData.Item.records.map(async record => {
        const userParams = {
          TableName: USER_TABLE,
          Key: {
            id: record.studentId
          }
        };
        
        const userData = await dynamodb.get(userParams).promise();
        
        return {
          Name: userData.Item?.name || "Name not found",
          RegistrationNumber: userData.Item?.registrationNumber || "Registration not found",
          Email: userData.Item?.email || "Email id not found",
          Status: record.status
        };
      })
    );
    
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(recordsWithUserDetails);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    res.setHeader('Content-Disposition', `attachment; filename=attendance_${eventName}_${eventDate}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (error) {
    console.error('Error downloading attendance:', error);
    res.status(500).json({ message: 'Error downloading attendance' });
  }
});

// Event Summary (Admin)
app.get('/admin/event-summary', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  try {
    const params = {
      TableName: ATTENDANCE_TABLE
    };
    
    const data = await dynamodb.scan(params).promise();
    const events = data.Items;
    
    const summary = await Promise.all(events.map(async event => {
      if (!event.records) return null;

      const presentCount = event.records.filter(record => record.status === 'present').length;
      const absentCount = event.records.filter(record => record.status === 'absent').length;
      
      return {
        eventName: event.eventName,
        eventDate: event.eventDate,
        presentCount,
        absentCount
      };
    })).then(results => results.filter(Boolean));
    
    res.json(summary);
  } catch (error) {
    console.error('Error fetching event summary:', error);
    res.status(500).json({ message: 'Error fetching event summary' });
  }
});

// Edit Attendance (Admin)
app.post('/admin/edit-attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  try {
    const { 
      studentId, 
      eventName, 
      eventDate, 
      newStatus 
    } = req.body;

    if (!studentId || !eventName || !eventDate || !newStatus) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Get the current attendance record
    const getParams = {
      TableName: ATTENDANCE_TABLE,
      Key: {
        eventName,
        eventDate
      }
    };
    
    const attendanceData = await dynamodb.get(getParams).promise();
    
    if (!attendanceData.Item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Event not found' 
      });
    }
    
    // Find and update the record
    const updatedRecords = attendanceData.Item.records.map(record => {
      if (record.studentId === studentId) {
        return { ...record, status: newStatus };
      }
      return record;
    });
    
    // Check if student was found
    const studentFound = attendanceData.Item.records.some(r => r.studentId === studentId);
    if (!studentFound) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student attendance record not found' 
      });
    }
    
    // Update the record
    const updateParams = {
      TableName: ATTENDANCE_TABLE,
      Key: {
        eventName,
        eventDate
      },
      UpdateExpression: 'SET records = :records',
      ExpressionAttributeValues: {
        ':records': updatedRecords
      },
      ReturnValues: 'ALL_NEW'
    };
    
    await dynamodb.update(updateParams).promise();
    
    res.json({ 
      success: true, 
      message: 'Attendance updated successfully' 
    });
  } catch (error) {
    console.error('Error editing attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Delete Event Attendance (Admin)
app.delete('/admin/delete-event', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  try {
    const { eventName, eventDate } = req.body;

    if (!eventName || !eventDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    const params = {
      TableName: ATTENDANCE_TABLE,
      Key: {
        eventName,
        eventDate
      },
      ReturnValues: 'ALL_OLD'
    };
    
    const result = await dynamodb.delete(params).promise();
    
    if (!result.Attributes) {
      return res.status(404).json({ 
        success: false, 
        message: 'Event not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Event attendance deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Start Server
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));