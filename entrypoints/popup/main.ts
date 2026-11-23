const app = document.getElementById('app');
if (app && !app.querySelector('h1')) {
  const heading = document.createElement('h1');
  heading.textContent = 'AlgoCleanse';
  app.appendChild(heading);
}
