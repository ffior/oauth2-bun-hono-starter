import { Layout as AntdLayout, Menu } from 'antd';
import { Link, Outlet, useLocation } from 'react-router';

const { Header, Content, Footer } = AntdLayout;

export function Layout() {
    const location = useLocation();
    return (
        <AntdLayout style={{ minHeight: '100vh' }}>
            <Header>
                <Menu
                    theme="dark"
                    mode="horizontal"
                    selectedKeys={[location.pathname]}
                    items={[
                        { key: '/', label: <Link to="/">Home</Link> },
                        {
                            key: '/about',
                            label: <Link to="/about">About</Link>,
                        },
                    ]}
                />
            </Header>
            <Content style={{ padding: 24 }}>
                <Outlet />
            </Content>
            <Footer style={{ textAlign: 'center' }}>Vite+ Starter</Footer>
        </AntdLayout>
    );
}
