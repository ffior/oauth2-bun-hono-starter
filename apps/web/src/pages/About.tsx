import { Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

export function AboutPage() {
    return (
        <Card>
            <Title level={2}>About</Title>
            <Paragraph>
                This project is scaffolded with Vite+ (vite, oxlint, oxfmt, rolldown, vitest) and uses React 19 + React
                Router 7 + Zustand + antd 6.
            </Paragraph>
        </Card>
    );
}
