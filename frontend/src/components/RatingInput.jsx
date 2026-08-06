import { useState } from 'react';

export default function RatingInput({ onSubmit }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return <p className="rating-input__thanks">Obrigado pela avaliação!</p>;
  }

  return (
    <div className="rating-input">
      <div className="rating-input__stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`rating-input__star ${(hover || value) >= n ? 'is-filled' : ''}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setValue(n)}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={(hover || value) >= n ? '#D98A2B' : 'none'} stroke="#D98A2B" strokeWidth="1.4">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
      {value > 0 && (
        <>
          <textarea
            className="form-textarea"
            placeholder="Quer deixar um comentário? (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            style={{ marginTop: 10 }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => { onSubmit(value, comentario); setSent(true); }}
          >
            Enviar avaliação
          </button>
        </>
      )}
    </div>
  );
}
