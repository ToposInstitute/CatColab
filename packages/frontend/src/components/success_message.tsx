import { createSignal, onMount } from "solid-js";
import "./success_message.css";

interface SuccessMessageProps {
  message: string;
  onClose?: () => void;
  autoClose?: boolean;
  duration?: number;
}

export function SuccessMessage(props: SuccessMessageProps) {
  const [isVisible, setIsVisible] = createSignal(false);
  const [isClosing, setIsClosing] = createSignal(false);

  onMount(() => {
    setTimeout(() => setIsVisible(true), 10);
    
    if (props.autoClose !== false) {
      setTimeout(() => {
        handleClose();
      }, props.duration || 3000);
    }
  });

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      props.onClose?.();
    }, 300);
  };

  return (
    <div class={`success-overlay ${isVisible() ? 'visible' : ''} ${isClosing() ? 'closing' : ''}`}>
      <div class="success-message">
        <div class="success-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <div class="success-content">
          <h3 class="success-title">Success!</h3>
          <p class="success-text">{props.message}</p>
        </div>
        <button class="success-close" onClick={handleClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}