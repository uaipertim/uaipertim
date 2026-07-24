import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class PushNotificationErrorBoundary extends Component<Props, State> {
  props!: Props;
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PUSH_NOTIFICATION_COMPONENT_ERROR:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border rounded-lg bg-red-50 border-red-100">
          <p className="text-sm text-red-600">Não foi possível carregar as notificações no dispositivo.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
