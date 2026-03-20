export const ErrorMessage = ({ message }: { message?: string | null }) =>
  message ? (
    <div className="message message--error" role="alert">
      {message}
    </div>
  ) : null;
