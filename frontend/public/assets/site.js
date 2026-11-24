// About / Blog / Contact পেজের কমন স্ক্রিপ্ট — পরে যা লাগবে এখানে যোগ করবেন
document.addEventListener('DOMContentLoaded', function () {
  var y = document.getElementById('copy-year');
  if (y) y.textContent = new Date().getFullYear();
});
