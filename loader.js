// Show loader on page load
window.addEventListener('load', function () {
    const loader = document.getElementById('loader');
    loader.classList.add('hidden'); // Hide loader after page load
});

// Show loader during data fetching
async function fetchData() {
    const loader = document.getElementById('loader');
    loader.classList.remove('hidden'); // Show loader

    try {
        // Simulate a fetch request or call your API here
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulating fetch time
        console.log("Data fetched");
    } finally {
        loader.classList.add('hidden'); // Hide loader after fetching data
    }
}
