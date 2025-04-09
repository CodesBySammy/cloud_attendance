// Login Form Submission
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const registrationNumber = document.getElementById('registrationNumber').value;
  const password = document.getElementById('password').value;
  const errorMessage = document.getElementById('errorMessage');

  if (!email || !registrationNumber || !password) {
    errorMessage.textContent = 'Please fill all fields';
    errorMessage.style.color = 'red';
    return;
  }

  try {
    errorMessage.textContent = 'Logging in...';
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, registrationNumber, password })
    });

    const data = await response.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      window.location.href = data.role === 'admin' ? 'admin.html' : 'user.html';
    } else {
      errorMessage.textContent = data.msg || 'Login failed. Please check your credentials.';
      errorMessage.style.color = 'red';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorMessage.textContent = 'Unable to connect to server. Please try again.';
    errorMessage.style.color = 'red';
  }
});



// Fetch User Events and Attendance
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  const errorMessage = document.getElementById('errorMessage');
  
  try {
    errorMessage.textContent = 'Loading your attendance...';
    const response = await fetch('/user/events', {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      errorMessage.textContent = errorData.message || 'Error loading attendance';
      errorMessage.style.color = 'red';
      return;
    }

    const attendanceData = await response.json();
    const userAttendanceTableBody = document.getElementById('userAttendanceTableBody');
    userAttendanceTableBody.innerHTML = '';
    
    if (attendanceData.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="5">No attendance records found</td>`;
      userAttendanceTableBody.appendChild(row);
      errorMessage.textContent = 'No attendance records found for your account';
      errorMessage.style.color = 'green';
    } else {
      attendanceData.forEach(record => {
        const row = document.createElement('tr');
        const statusColor = record.status === 'absent' ? 'red' : 'black';
        row.innerHTML = `
          <td>${record.eventName}</td>
          <td>${record.eventDate}</td>
          <td>${record.eventStartTime}</td>
          <td>${record.eventEndTime}</td>
          <td style="color: ${statusColor};">${record.status}</td>
        `;
        userAttendanceTableBody.appendChild(row);
      });
      errorMessage.textContent = `Loaded ${attendanceData.length} attendance records`;
      errorMessage.style.color = 'green';
    }
  } catch (error) {
    console.error('Error fetching attendance:', error);
    errorMessage.textContent = 'Failed to load attendance. Please try again.';
    errorMessage.style.color = 'red';
  }

  // Logout
  document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
  });
});
