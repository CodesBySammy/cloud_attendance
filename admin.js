document.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  // DOM Elements
  const createEventBtn = document.getElementById('createEvent');
  const postAttendanceBtn = document.getElementById('postAttendance');
  const viewAttendanceBtn = document.getElementById('viewAttendance');
  const downloadAttendanceBtn = document.getElementById('downloadAttendance');
  const studentsTableBody = document.getElementById('studentsTableBody');
  const attendanceTableBody = document.getElementById('attendanceTableBody');
  const eventMessage = document.getElementById('eventMessage');
  const viewEventSummaryBtn = document.getElementById('viewEventSummary');
  const eventSummaryTableBody = document.getElementById('eventSummaryTableBody');

  // Fetch Students for Attendance
  createEventBtn?.addEventListener('click', async () => {
    try {
      const response = await fetch('/admin/students', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        eventMessage.textContent = errorData.message || 'Failed to fetch students';
        return;
      }

      const students = await response.json();
      studentsTableBody.innerHTML = '';
      
      students.forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${student.registrationNumber}</td>
          <td>${student.name}</td>
          <td>${student.email}</td>
          <td>
            <select data-student-id="${student.id}">
              <option value="absent">Absent</option>
              <option value="present">Present</option>
            </select>
          </td>
        `;
        studentsTableBody.appendChild(row);
      });
    } catch (error) {
      console.error('Error fetching students:', error);
      eventMessage.textContent = 'Error fetching students';
    }
  });

  // Post Attendance
  postAttendanceBtn?.addEventListener('click', async () => {
    const eventName = document.getElementById('eventName').value;
    const eventDate = document.getElementById('eventDate').value;
    const eventStartTime = document.getElementById('eventStartTime').value;
    const eventEndTime = document.getElementById('eventEndTime').value;
    
    if (!eventName || !eventDate || !eventStartTime || !eventEndTime) {
      eventMessage.textContent = 'Please fill all event details';
      return;
    }

    const attendance = Array.from(document.querySelectorAll('[data-student-id]')).map(select => ({
      studentId: select.dataset.studentId,
      status: select.value,
    }));

    try {
      const response = await fetch('/admin/post-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ eventName, eventDate, eventStartTime, eventEndTime, attendance }),
      });

      const data = await response.json();
      eventMessage.textContent = data.message;

      if (response.ok) {
        // Clear form
        document.getElementById('eventName').value = '';
        document.getElementById('eventDate').value = '';
        document.getElementById('eventStartTime').value = '';
        document.getElementById('eventEndTime').value = '';
      }
    } catch (error) {
      console.error('Error posting attendance:', error);
      eventMessage.textContent = 'Error posting attendance';
    }
  });

  // View Attendance
  viewAttendanceBtn?.addEventListener('click', async () => {
    const viewEventName = document.getElementById('viewEventName').value;
    const viewEventDate = document.getElementById('viewEventDate').value;

    if (!viewEventName || !viewEventDate) {
      eventMessage.textContent = 'Please provide event name and date';
      return;
    }

    try {
      const response = await fetch(
        `/admin/view-attendance?eventName=${encodeURIComponent(viewEventName)}&eventDate=${encodeURIComponent(viewEventDate)}`, 
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      
      attendanceTableBody.innerHTML = '';

      if (!response.ok) {
        const data = await response.json();
        eventMessage.textContent = data.message || 'Error viewing attendance';
        return;
      }

      const attendance = await response.json();

      if (attendance.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5">No attendance records found.</td>`;
        attendanceTableBody.appendChild(row);
      } else {
        attendance.forEach(record => {
          const row = document.createElement('tr');
          const statusColor = record.status === 'absent' ? 'red' : 'black';

          row.innerHTML = `
            <td>${record.registrationNumber}</td>
            <td>${record.name}</td>
            <td>${record.email}</td>
            <td style="color: ${statusColor};">${record.status}</td>
            <td>
              <button class="edit-attendance" 
                      data-student-id="${record._id}"
                      data-event-name="${viewEventName}"
                      data-event-date="${viewEventDate}">
                Edit
              </button>
            </td>
          `;
          attendanceTableBody.appendChild(row);
        });

        // Add edit button handlers
        document.querySelectorAll('.edit-attendance').forEach(button => {
          button.addEventListener('click', () => {
            const studentId = button.getAttribute('data-student-id');
            const eventName = button.getAttribute('data-event-name');
            const eventDate = button.getAttribute('data-event-date');
            
            // Find the record to get current status
            const row = button.closest('tr');
            const currentStatus = row.querySelector('td:nth-child(4)').textContent.toLowerCase();
            
            // Populate modal
            document.getElementById('editStudentId').value = studentId;
            document.getElementById('editEventName').value = eventName;
            document.getElementById('editEventDate').value = eventDate;
            document.getElementById('editAttendanceStatus').value = currentStatus;
            
            // Show modal
            document.getElementById('editAttendanceModal').style.display = 'block';
            document.getElementById('modalBackground').style.display = 'flex';
          });
        });
      }
    } catch (error) {
      console.error('Error viewing attendance:', error);
      eventMessage.textContent = 'Error viewing attendance';
    }
  });

  // Save Edited Attendance - Fixed Version
  document.getElementById('saveEditedAttendance')?.addEventListener('click', async () => {
    try {
      const studentId = document.getElementById('editStudentId').value;
      const eventName = document.getElementById('editEventName').value;
      const eventDate = document.getElementById('editEventDate').value;
      const newStatus = document.getElementById('editAttendanceStatus').value;

      if (!studentId || !eventName || !eventDate || !newStatus) {
        alert('Please fill all required fields');
        return;
      }

      // Disable button during request
      const saveBtn = document.getElementById('saveEditedAttendance');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const response = await fetch('/admin/edit-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          studentId,
          eventName,
          eventDate,
          newStatus
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update attendance');
      }

      const data = await response.json();
      
      // Close modal
      document.getElementById('editAttendanceModal').style.display = 'none';
      document.getElementById('modalBackground').style.display = 'none';
      
      // Refresh view
      if (viewAttendanceBtn) viewAttendanceBtn.click();
      
      // Show success
      eventMessage.textContent = data.message || 'Attendance updated successfully';
      eventMessage.style.color = 'green';

    } catch (error) {
      console.error('Error editing attendance:', error);
      eventMessage.textContent = error.message || 'Error updating attendance';
      eventMessage.style.color = 'red';
    } finally {
      // Reset button
      const saveBtn = document.getElementById('saveEditedAttendance');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    }
  });

  // Download Attendance as Excel
  downloadAttendanceBtn?.addEventListener('click', async () => {
    const eventName = document.getElementById('viewEventName').value;
    const eventDate = document.getElementById('viewEventDate').value;
    
    if (!eventName || !eventDate) {
      eventMessage.textContent = 'Please fill all required event details (Name and Date)';
      return;
    }

    try {
      const response = await fetch(
        `/admin/download-attendance?eventName=${encodeURIComponent(eventName)}&eventDate=${encodeURIComponent(eventDate)}`, 
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        eventMessage.textContent = errorData.message || 'Failed to download attendance';
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${eventName}_${eventDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attendance:', error);
      eventMessage.textContent = 'Error downloading attendance';
    }
  });

  // View Event Summary
  viewEventSummaryBtn?.addEventListener('click', async () => {
    try {
      const response = await fetch('/admin/event-summary', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!response.ok) {
        const data = await response.json();
        eventMessage.textContent = data.message || 'Error fetching event summary';
        return;
      }

      const summaries = await response.json();

      // Clear previous summaries
      eventSummaryTableBody.innerHTML = '';

      if (summaries.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="7">No event summaries available</td>`;
        eventSummaryTableBody.appendChild(row);
      } else {
        summaries.forEach(summary => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${summary.eventName}</td>
            <td>${summary.eventDate}</td>
            <td>${summary.presentCount}</td>
            <td>${summary.absentCount}</td>
            <td>
              <button class="delete-event" 
                      data-event-name="${summary.eventName}"
                      data-event-date="${summary.eventDate}"
                      style="background-color: red; color: white;">
                Delete
              </button>
            </td>
          `;
          eventSummaryTableBody.appendChild(row);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-event').forEach(button => {
          button.addEventListener('click', async () => {
            const eventName = button.getAttribute('data-event-name');
            const eventDate = button.getAttribute('data-event-date');
            
            const confirmDelete = confirm(`Are you sure you want to delete the event: ${eventName} on ${eventDate}?`);
            
            if (confirmDelete) {
              try {
                const response = await fetch('/admin/delete-event', {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                  },
                  body: JSON.stringify({ 
                    eventName, 
                    eventDate
                  }),
                });

                const data = await response.json();
                
                if (data.success) {
                  // Remove the row from the table
                  button.closest('tr').remove();
                  eventMessage.textContent = 'Event deleted successfully';
                } else {
                  eventMessage.textContent = 'Failed to delete event: ' + data.message;
                }
              } catch (error) {
                console.error('Error deleting event:', error);
                eventMessage.textContent = 'An error occurred while deleting the event';
              }
            }
          });
        });
      }
    } catch (error) {
      console.error('Error fetching event summary:', error);
      eventMessage.textContent = 'Error fetching event summary';
    }
  });

  // Save Edited Attendance
  document.getElementById('saveEditedAttendance')?.addEventListener('click', async () => {
    const studentId = document.getElementById('editStudentId').value;
    const eventName = document.getElementById('editEventName').value;
    const eventDate = document.getElementById('editEventDate').value;
    const newStatus = document.getElementById('editAttendanceStatus').value;

    try {
      const response = await fetch('/admin/edit-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          studentId,
          eventName,
          eventDate,
          newStatus
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Close the edit modal
        document.getElementById('editAttendanceModal').style.display = 'none';
        document.getElementById('modalBackground').style.display = 'none';
        
        // Refresh the attendance view
        viewAttendanceBtn?.click();
        
        eventMessage.textContent = data.message;
      } else {
        eventMessage.textContent = 'Failed to update attendance: ' + data.message;
      }
    } catch (error) {
      console.error('Error editing attendance:', error);
      eventMessage.textContent = 'An error occurred while editing attendance';
    }
  });

  // Modal handling
  document.querySelectorAll('.open-modal')?.forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.modal-content').forEach(modal => modal.style.display = 'none');
      const modalId = button.getAttribute('data-modal');
      document.getElementById(modalId).style.display = 'block';
      document.getElementById('modalBackground').style.display = 'flex';
    });
  });
  
  document.querySelectorAll('.close-modal')?.forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.modal-content').forEach(modal => modal.style.display = 'none');
      document.getElementById('modalBackground').style.display = 'none';
    });
  });
  
  document.getElementById('modalBackground')?.addEventListener('click', (event) => {
    if (event.target === document.getElementById('modalBackground')) {
      document.querySelectorAll('.modal-content').forEach(modal => modal.style.display = 'none');
      document.getElementById('modalBackground').style.display = 'none';
    }
  });

  // Logout
  document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
  });
});
