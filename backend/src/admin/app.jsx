const OriginalIcon = props => <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v14H4zM4 15l5-5 5 5 3-3 3 3M15 8h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;

export default {
  register(app) {
    app.addMenuLink({ to: '/plugins/wallpaper-originals', icon: OriginalIcon,
      intlLabel: { id: 'wallpaper-originals.name', defaultMessage: 'Оригиналы обоев' },
      Component: () => import('./pages/Originals'),
      permissions: [{ action: 'plugin::wallpaper-originals.manage', subject: null }], position: 4 });
    app.registerPlugin({ id: 'wallpaper-originals', name: 'Оригиналы обоев' });
  },
};
