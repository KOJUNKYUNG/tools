interface FooterProps {
  copyright: string;
}

export function Footer({ copyright }: FooterProps) {
  return (
    <footer className="border-t border-wood-200 bg-wood-50/50 py-6 text-center text-sm text-wood-600">
      <p>{copyright}</p>
    </footer>
  );
}
