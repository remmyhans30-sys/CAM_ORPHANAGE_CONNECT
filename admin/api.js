const API_BASE = 'http://localhost:4000/api';

function apiRequest(path, options) {
  options = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = localStorage.getItem('adminToken');
  if (token) headers.Authorization = 'Bearer ' + token;

  return fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (response) {
    if (response.status === 204) return null;

    return response.json().catch(function () { return null; }).then(function (data) {
      if (!response.ok) {
        const message = (data && data.error) || ('Request failed with status ' + response.status);
        throw new Error(message);
      }
      return data;
    });
  });
}
