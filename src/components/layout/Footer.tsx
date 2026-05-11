interface FooterProps {
  copyright: string;
}

export function Footer({ copyright }: FooterProps) {
  return (
    <footer className="border-t border-silver-200 bg-silver-50/50 py-6 text-center text-sm text-silver-600">
      <p>{copyright}</p>
    </footer>
  );
}
