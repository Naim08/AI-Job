import React from 'react';

const HistoryPage: React.FC = () => {
  return (
    <div>
      <h1>History Page</h1>
      <p>History goes here</p>
      {/* Add a lot of content to test scrolling */}
      {Array.from({ length: 100 }).map((_, i) => (
        <p key={i}>Scrollable content {i + 1}</p>
      ))}
    </div>
  );
};

export default HistoryPage; 