import React from 'react'

const LoadingIcon = props => (
  <svg
    height="33"
    viewBox="0 0 100 100"
    width="33"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle
      cx="50"
      cy="50"
      fill="none"
      r="33"
      stroke="#FF6C15"
      strokeDasharray="155.50883635269477 53.83627878423159"
      strokeWidth="5"
    >
      <animateTransform
        attributeName="transform"
        dur="1s"
        keyTimes="0;1"
        repeatCount="indefinite"
        type="rotate"
        values="0 50 50;360 50 50"
      ></animateTransform>
    </circle>
  </svg>
)

export default LoadingIcon
