const bibtexParse = require('bibtex-parse');

const testBib = `@ARTICLE{Test2024-xy,
  title = "Test Paper",
  author = "Smith, John and Doe, Jane",
  year = 2024,
  journal = "Test Journal"
}`;

try {
    const result = bibtexParse.parse(testBib);
    console.log('Parse successful!');
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error('Parse failed:', error);
}
