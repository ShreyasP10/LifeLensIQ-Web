const { classifyYouTubeTitle, CATEGORIES } = require('./extension/src/shared/categories.js');

console.log('Testing classifyYouTubeTitle:');
console.log('Python tutorial for beginners:', classifyYouTubeTitle('Python tutorial for beginners'));
console.log('JavaScript lecture 1', classifyYouTubeTitle('JavaScript lecture 1'));
console.log('Leetcode problem solution', classifyYouTubeTitle('Leetcode problem solution'));
console.log('React tutorial for beginners', classifyYouTubeTitle('React tutorial for beginners'));
console.log('Music video', classifyYouTubeTitle('Music video'));
console.log('#shorts video', classifyYouTubeTitle('Funny cat #shorts'));
console.log('Gaming video', classifyYouTubeTitle('Gaming highlights'));