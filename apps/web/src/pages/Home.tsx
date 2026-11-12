import { Button, Card, Space, Typography } from "antd";

import { useCounterStore } from "../store/counter";

const { Title, Paragraph } = Typography;

export function HomePage() {
  const { count, increment, decrement, reset } = useCounterStore();
  return (
    <Card>
      <Title level={2}>Home</Title>
      <Paragraph>Vite+ · React 19 · React Router 7 · Zustand · antd 6</Paragraph>
      <Title level={4}>Counter: {count}</Title>
      <Space>
        <Button type="primary" onClick={increment}>
          +1
        </Button>
        <Button onClick={decrement}>-1</Button>
        <Button danger onClick={reset}>
          Reset
        </Button>
      </Space>
    </Card>
  );
}
